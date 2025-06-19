#!/usr/bin/env python3

# pip install beautifulsoup4 tqdm requests

import requests
from bs4 import BeautifulSoup, Tag
import re
import json
import logging
import os
from tqdm import tqdm

BASE_URL = 'https://hackropole.fr'
CHALLENGES_PATH = '/fr/challenges/'
DUMP_FILE = 'hackropole_dump.json'

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

# Reuse a single HTTP session for all requests
session = requests.Session()

def fetch_challenge_links():
    """Fetches all challenge relative paths from the main challenges page."""
    url = BASE_URL + CHALLENGES_PATH
    logging.info(f"Fetching challenge list from {url}")
    resp = session.get(url)
    resp.raise_for_status()
    resp.encoding = 'utf-8'

    soup = BeautifulSoup(resp.text, 'html.parser')
    rows = soup.select('main.container table tbody tr')
    links = []

    for row in rows:
        a = row.find('a', class_='stretched-link')
        if a and a.has_attr('href'):
            href = a['href']
            if not href.startswith(CHALLENGES_PATH):
                logging.warning(f"Skipping unexpected link: {href}")
                continue
            path = href[len(CHALLENGES_PATH):].strip('/')
            links.append(path)

    # Validate count
    count_div = soup.select_one('div.jumbotron .h5')
    if not count_div:
        raise RuntimeError("Could not find challenge count on page")

    total = int(re.search(r"(\d+)", count_div.get_text()).group(1))
    if total != len(links):
        raise ValueError(f"Count mismatch: expected {total}, found {len(links)}")

    return links

def extract_section_text(soup, header_text):
    """Extracts all visible text under a given <h2> section name until the next <h2>."""
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

def fetch_challenge(path):
    """Fetch and parse a single challenge given its relative path."""
    category, name = path.split('/', 1)
    url = BASE_URL + CHALLENGES_PATH + path
    #logging.info(f"Fetching challenge {path}")
    resp = session.get(url)
    resp.raise_for_status()
    resp.encoding = 'utf-8'
    soup = BeautifulSoup(resp.text, 'html.parser')

    # Title
    title = soup.select_one(".jumbotron h1.fw-light").get_text(strip=True)

    # Tags
    tags = [b.get_text(strip=True) for b in soup.select(
        ".jumbotron .badge.text-bg-warning, .jumbotron a.badge.text-bg-info"
    )]
    # Remove category tag
    removed_category = False
    for t in tags:
        if category.lower() == t.lower():
            tags.remove(t)
            removed_category = True
            break
    if not removed_category:
        logging.warning(f"Category '{category}' not found in {tags} for {name}")
    # Extract year from tags (e.g. 'FCSC 2023') and remove it
    year = None
    for t in tags:
        m = re.fullmatch(r'FCSC (\d{4})', t)
        if m:
            year = int(m.group(1))
            tags.remove(t)
            break

    # Difficulty: count filled stars in the jumbotron
    difficulty = len(soup.select(".jumbotron svg use[href='#star-fill']"))

    if 'intro' in tags:
        tags.remove('intro')
    elif difficulty == 0:
        logging.warning(f"Challenge {name} has no difficulty set, assuming 'intro'...")

    description = extract_section_text(soup, 'Description')

    # Files
    files = [
        {'url': a['href'], 'name': a.get('download') or a.get_text(strip=True)}
        for a in soup.select('.list-file li a')
    ]

    instructions_raw = extract_section_text(soup, 'Instructions')
    instructions = [line.strip() for line in instructions_raw.split('\n') if line.strip()]

    # Flag format
    flag_in = soup.select_one('#flag-form input#flag')
    flag_infos = {
        'placeholder': flag_in.get('placeholder', ''),
        'hash': flag_in.get('data-flags-hash'),
        'case_insensitive': flag_in.get('data-case-insensitive') == 'true'
    }

    # Solutions (deduplicated)
    sol_links = [a['href'] for a in soup.select('#solutions-list a.stretched-link')]
    solutions_urls = sorted(set(sol_links))

    return {
        'year': year,
        'category': category,
        'difficulty': difficulty,
        'tags': tags,
        'title': title,
        'description': description,
        'files': files,
        'instructions': instructions,
        'flag_infos': flag_infos,
        'solutions_urls': solutions_urls
    }

def update_dump(links):
    """Merge fetched challenges into a single JSON dump file with uniform progress labels."""
    # Load existing data
    if os.path.exists(DUMP_FILE):
        with open(DUMP_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    else:
        data = {}

    # Filter out already-fetched challenges
    new_links = [p for p in links if p not in data]
    if not new_links:
        logging.info("No new challenge to fetch.")
        return

    # Determine max path length for padding
    max_len = max(len(p) for p in new_links)
    fmt = f"{{:<{max_len}}}"  # fixed-width description

    with tqdm(new_links, desc="Initializing", unit="item") as pbar:
        for path in pbar:
            pbar.set_description(fmt.format(path))
            # Skip if the challenge is already dumped
            if path in data:
                continue
            try:
                ch = fetch_challenge(path)
            except Exception as e:
                logging.error(f"Failed to fetch {path}: {e}")
                continue
            data[path] = ch

    # Write out
    with open(DUMP_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logging.info(f"Dump updated: {DUMP_FILE} has {len(data)} challenges.")

def main():
    links = fetch_challenge_links()
    logging.info(f"Found {len(links)} challenge links, fetching new challenges...")
    update_dump(links)


if __name__ == '__main__':
    main()
