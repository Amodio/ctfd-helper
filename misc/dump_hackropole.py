#!/usr/bin/env python3

# pip install beautifulsoup4 tqdm requests --break-system-packages

"""
This program dumps CTF challenges from Hackropole into a local directory:
DATA_DIR/
   //    category/
   //       //    challenge-uri/
   //       //          //      details.json
   //       //          //      files/    <- if it contains any files
   //       //          //      writeups/ <- if there are writeups

By default, only english challenge details are retrieved, pass the `-a`
or `--all-languages` argument to include both languages.

You can filter downloaded challenges with the `-c` or `--category` option.
You can also download only the challenge details with: `--only-details`.

This program should not overwrite existing files.
If you want to update your local writeups, delete the challenges' details:
rm -f hackropole/*/*/details.json
"""

from bs4 import BeautifulSoup, Tag
from tqdm import tqdm
import argparse
import json
import logging
import os
import re
import requests
import time

BASE_URL = 'https://hackropole.fr'
DATA_DIR = 'hackropole'
HTTP_REQUEST_INTERVAL = 337     # time to wait between each HTTP request in ms

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

class CountingSession(requests.Session):
    def __init__(self):
        super().__init__()
        self.request_count = 0

    def request(self, method, url, **kwargs):
        self.request_count += 1
        logging.debug(f"{method} {url}")
        response = super().request(method, url, **kwargs)
        time.sleep(HTTP_REQUEST_INTERVAL / 1000)
        return response

# Reuse a single HTTP session for all requests
session = CountingSession()

def fetch_urls() -> list[tuple[str, str]]:
    """Extracts the challenges list URI from Hackropole."""
    # Despite the prefix, URI is the same for both languages (en&fr)
    response = session.get(BASE_URL + "/en/index.json")
    response.raise_for_status()     # Raise error if request failed
    data = response.json()
    # data = json.loads(r'''[
    # {
    #     "uri": "https://hackropole.fr/en/challenges/reverse/fcsc2019-reverse-ybab/"
    # },
    # {
    #     "uri": "https://hackropole.fr/en/challenges/hardware/fcsc2024-hardware-unknown-public-key/"
    # }]''')
    prefix = BASE_URL + '/en/challenges/'
    return [
        tuple(cleaned.split('/', 1))    # returns: [(category, challenge_url)*]
        # We only extract the "uri" parameter and not: title, tags or content
        for uri in (item.get('uri', '') for item in data)
        # Remove prefix and trailing slash
        for cleaned in [uri[len(prefix):].rstrip('/')]
        # Skip the empty string
        if uri.startswith(prefix) and cleaned and '/' in cleaned
    ]

def _extract_section_text(soup: BeautifulSoup, header_text: str) -> str:
    """Extracts all visible text under a given <h2> section name."""
    for h2 in soup.find_all('h2'):
        if header_text.lower() in h2.get_text(strip=True).lower():
            texts = []
            for sib in h2.find_next_siblings():
                if sib.name == 'h2':
                    break
                if isinstance(sib, Tag):
                    texts.append(sib.get_text(separator=' ', strip=True))
            return '\n\n'.join(texts)
    return ''

def _fetch_challenge_details(category: str, challenge_uri: str, lang: str) -> dict:
    """Fetch and parse a single challenge page for the given language."""
    url = f"{BASE_URL}/{lang}/challenges/{category}/{challenge_uri}/"
    resp = session.get(url)
    resp.raise_for_status()
    resp.encoding = 'utf-8'
    soup = BeautifulSoup(resp.text, 'html.parser')

    # Title
    title = soup.select_one('.jumbotron h1.fw-light').get_text(strip=True)

    # Tags
    tags = [b.get_text(strip=True) for b in soup.select(
        '.jumbotron .badge.text-bg-warning, .jumbotron a.badge.text-bg-info'
    )]

    # Remove category tag
    removed_category = False
    for t in tags:
        if category.lower() == t.lower():
            tags.remove(t)
            removed_category = True
            break
    if not removed_category:
        logging.warning(f"'{category=}' not found in {tags=} for {challenge_uri}.")

    # Extract year from tags (e.g. 'FCSC 2023')
    year = None
    for t in tags:
        m = re.fullmatch(r'FCSC (\d{4})', t)
        if m:
            year = int(m.group(1))
            #tags.remove(t)
            break
    # Fallback: extract year from URI
    if year == None:
        m = re.match(r'(\d{4})', challenge_uri)
        if m:
            year = int(m.group(1))
 
    # Difficulty: count filled stars
    difficulty = len(soup.select(".jumbotron svg use[href='#star-fill']"))

    if 'intro' in tags:
        if difficulty > 0:
            logging.warning(f"Removing intro tag on a difficult challenge: {challenge_uri}.")
        tags.remove('intro')
    elif difficulty == 0:
        logging.warning(f"Challenge {challenge_uri} has no 'intro' tag.")

    description = _extract_section_text(soup, 'Description')

    # Files
    files = [
        {
            'url': (a := li.find('a'))['href'],
            'name': a.get('download') or a.get_text(strip=True),
            'sha256': s['title'] if (s := li.find('span', class_='clip-sha256')) else None,
        }
        for li in soup.select('.list-file li')
        if li.find('a')
    ]

    # Authors
    authors = next(
        ([d.get_text(strip=True) for d in h2.find_next('div', class_='row').find_all('div', class_='font-monospace')]
         for h2 in soup.find_all('h2')
         if 'author' in h2.get_text(strip=True).lower()),
        []
    )

    # Instructions
    instructions_raw = _extract_section_text(soup, 'Instructions')
    instructions = [line.strip() for line in instructions_raw.split('\n') if line.strip()]

    # Flag format
    flag_in = soup.select_one('#flag-form input#flag')
    flag_infos = {
        'placeholder': flag_in.get('placeholder', ''),
        'hash': flag_in.get('data-flags-hash'),
        'case_insensitive': flag_in.get('data-case-insensitive') == 'true'
    }

    # Solutions/writeups
    LANG_MAP = {'🇫🇷': 'fr', '🇬🇧': 'en'}
    solutions = [
        {
            'url':    (a := row.find('a', class_='stretched-link'))['href'],
            'date':   tds[0].find('span', class_='badge').get_text(strip=True) if (tds := row.find_all('td', class_='p-0')) else None,
            'author': tds[1].find('span', class_='text-body-emphasis').get_text(strip=True) if len(tds) > 1 else None,
            'lang':   LANG_MAP.get(tds[2].get_text(strip=True)) if len(tds) > 2 else None,
            'tags':   [b.get_text(strip=True) for b in tds[3].find_all('span', class_='badge')] if len(tds) > 3 else [],
        }
        for row in soup.select('#solutions-list tr[data-solution]')
        if row.find('a', class_='stretched-link')
    ]

    return {
        'year': year,
        'category': category,
        'difficulty': difficulty,
        'tags': tags,
        'title': title,
        'description': description,
        'instructions': instructions,
        'files': files,
        'authors': authors,
        'flag_infos': flag_infos,
        'solutions': solutions
    }

def _sha256_of(path: str) -> str:
    """Return the sha256 hash of a file."""
    import hashlib
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()

def _download_file(url: str, dest_path: str, expected_sha256: str = None) -> None:
    """Download a file to dest_path, skipping if it already exists and hash matches."""
    if os.path.exists(dest_path):
        if expected_sha256 and _sha256_of(dest_path) != expected_sha256:
            logging.warning(f"SHA256 mismatch for cached {dest_path}, re-downloading...")
        else:
            return
    resp = session.get(url)
    resp.raise_for_status()
    with open(dest_path, 'wb') as f:
        f.write(resp.content)
    actual = _sha256_of(dest_path)
    if expected_sha256 and actual != expected_sha256:
        os.remove(dest_path) # remove the corrupted (and just downloaded) file
        raise ValueError(f"SHA256 mismatch for {dest_path}, expected: {expected_sha256}\n")

def _download_writeup(url: str, dest_dir: str) -> None:
    """Download a writeup HTML page into dest_dir, skipping if already present."""
    # Use the last path segment as filename, fallback to index.html
    slug = url.rstrip('/').rsplit('/', 1)[-1] or 'index'
    dest_path = os.path.join(dest_dir, slug + '.html')
    if os.path.exists(dest_path):
        return
    try:
        resp = session.get(url)
        resp.raise_for_status()
        with open(dest_path, 'w', encoding='utf-8') as f:
            f.write(resp.text)
    except Exception as e:
        logging.warning(f"Could not fetch writeup {url}: {e}")

def process_challenge(category: str, challenge_uri: str, languages: list[str],
                    only_details: bool, pbar=None, fmt: str = "{}",) -> None:
    """Fetch details, challenge files, and writeups for a single challenge."""
    challenge_dir = os.path.join(DATA_DIR, category, challenge_uri)
    os.makedirs(challenge_dir, exist_ok=True)

    details_path = os.path.join(challenge_dir, 'details.json')

    # Merge details across requested languages
    if os.path.exists(details_path):
        with open(details_path, 'r', encoding='utf-8') as f:
            details = json.load(f)
    else:
        details = {}
    missing_langs = [lang for lang in languages if f'description_{lang}' not in details]
    for lang in missing_langs:
        try:
            lang_details = _fetch_challenge_details(category, challenge_uri, lang)
        except Exception as e:
            logging.error(f"Failed to fetch details ({lang}) for {category}/{challenge_uri}: {e}")
            continue
        # Insert new lang-specific keys before the rest
        details = {f'description_{lang}': lang_details.pop('description'),
                   f'instructions_{lang}': lang_details.pop('instructions'),
                   **details}
        # Rest of shared fields "read once" (from first language fetched)
        for key in ('year', 'category', 'difficulty', 'tags', 'title', 'files', 'flag_infos', 'authors', 'solutions'):
            if key not in details:
                details[key] = lang_details.get(key)

    if missing_langs:
        with open(details_path, 'w', encoding='utf-8') as f:
            json.dump(details, f, ensure_ascii=False, indent=2)

    if only_details:
        return

    def set_file(name):
        if pbar is not None:
            challenge_path = f"{category}/{challenge_uri}"
            suffix = f" ({name})" if name else ""
            pbar.set_description(fmt.format(challenge_path + suffix))

    # Download challenge files
    challenge_files = details.get('files', [])
    if challenge_files:
        files_dir = os.path.join(challenge_dir, 'files')
        os.makedirs(files_dir, exist_ok=True)
        for file_info in challenge_files:
            file_url = file_info['url']
            file_name = file_info.get('name') or file_url.rsplit('/', 1)[-1]
            dest = os.path.join(files_dir, file_name)
            try:
                set_file(file_name)
                _download_file(file_url, dest, file_info.get('sha256'))
            except Exception as e:
                logging.warning(f"Could not download file {file_url}: {e}")

    # Download writeups
    solutions = details.get('solutions', [])
    if solutions:
        writeups_dir = os.path.join(challenge_dir, 'writeups')
        os.makedirs(writeups_dir, exist_ok=True)
        for sol in solutions:
            set_file(f"Writeup of {sol['author']}")
            _download_writeup(sol['url'], writeups_dir)

    set_file("")

def main() -> None:
    start = time.monotonic()
    parser = argparse.ArgumentParser(description="Dump CTF challenges from Hackropole.")
    parser.add_argument(
        '-a', '--all-languages',
        action='store_true',
        help='Download challenge details in both English and French (default: English only).'
    )
    parser.add_argument(
        '-c', '--category',
        help='Only download challenges from this category (e.g. crypto, forensics, hardware, misc, pwn, reverse, web).'
    )
    parser.add_argument(
        '--only-details',
        action='store_true',
        help='Only download challenge details (skip challenge files and writeups).'
    )
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help="Log every HTTP request."
    )
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    languages = ['en', 'fr'] if args.all_languages else ['en']

    logging.info('Fetching challenge list...')
    all_challenges = fetch_urls()

    if args.category:
        challenges = [(cat, uri) for cat, uri in all_challenges if cat == args.category]
        logging.info(f"Filtered to {len(challenges)} challenges in category '{args.category}'.")
    else:
        challenges = all_challenges
        logging.info(f"Found {len(challenges)} challenges.")

    os.makedirs(DATA_DIR, exist_ok=True)

    max_len = max((len(f"{cat}/{uri}") for cat, uri in challenges), default=0)
    fmt = f"{{:<{max_len}}}"

    with tqdm(challenges, unit='challenge') as pbar:
        for category, challenge_uri in pbar:
            pbar.set_description(fmt.format(f"{category}/{challenge_uri}"))
            process_challenge(category, challenge_uri, languages, args.only_details, pbar, fmt)

    elapsed = time.monotonic() - start
    logging.info(f"Total HTTP requests made: {session.request_count} in {elapsed:.1f}s")

if __name__ == '__main__':
    main()
