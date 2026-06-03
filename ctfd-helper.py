#!/usr/bin/env python3

import os
from flask import Flask, jsonify, request, send_from_directory
import json
from datetime import datetime, timezone
import requests
import webbrowser
import sys
import hashlib
import struct

app = Flask(__name__)
DATA_DIR = 'data'
CACHE_DIR = 'cache'

if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    FRONTEND_DIR = os.path.join(sys._MEIPASS, 'build')
else:
    FRONTEND_DIR = 'build'

# CTF data cache
_ctf_data_cache = {'ctf_id': None, 'data': None}

def load_ctf_cache(ctf_id):
    """Loads CTF data from a JSON file, caching the last opened file.
    If ctf_id changes, reload from file."""
    global _ctf_data_cache
    if _ctf_data_cache['ctf_id'] == ctf_id and _ctf_data_cache['data']:
        return _ctf_data_cache['data']
    filename = os.path.join(DATA_DIR, f"ctf_{ctf_id}.json")
    try:
        with open(filename, 'r') as f:
            data = json.load(f)
            _ctf_data_cache['ctf_id'] = ctf_id
            _ctf_data_cache['data'] = data
            return data
    except FileNotFoundError:
        print(f"Error: CTF data file not found for ID {ctf_id}")
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON in file {filename}")
    _ctf_data_cache['ctf_id'] = None
    _ctf_data_cache['data'] = None
    return None

def update_ctf_cache(ctf_id, ctf_data):
    """Updates the CTF data for a given CTF ID and saves it to a JSON file."""
    global _ctf_data_cache
    try:
        filename = os.path.join(DATA_DIR, f"ctf_{ctf_id}.json")
        with open(filename, 'w') as f:
            json.dump(ctf_data, f)
        _ctf_data_cache['data'] = ctf_data
        return True
    except Exception as e:
        print(f"Error: updating CTF #{ctf_id} cache: {e}")
    _ctf_data_cache['data'] = None # Reset cache on failure
    return False

@app.route('/ctfs', methods=['GET'])
def list_ctfs():
    """Lists available saved CTFs and returns the last used login if available."""
    ctf_list = []
    last_login = None
    for filename in os.listdir(DATA_DIR):
        if filename.startswith('ctf_') and filename.endswith('.json'):
            try:
                with open(os.path.join(DATA_DIR, filename), 'r') as f:
                    data = json.load(f)
                    ctf_id = int(filename[4:-5])
                    ctf_entry = {
                        'id': ctf_id,
                        'name': data.get('name'),
                        'url': data.get('url'),
                        'login': data.get('login'),
                        'refresh_delay': data.get('refresh_delay', None),
                    }
                    ctf_list.append(ctf_entry)
                    # Track the last login found (most recent file wins)
                    if data.get('login'):
                        last_login = data.get('login')
            except Exception:
                pass
    return jsonify({'ctfs': ctf_list, 'last_login': last_login})

@app.route('/update_token/<int:ctf_id>', methods=['POST'])
def update_ctf_token(ctf_id):
    return jsonify({'error': 'Token update is not supported. Login/password are now used.'}), 400

def fetch_challenge_list(url, login, password, ctf_data=None, ctf_id=None):
    """Fetches the challenge list from the remote CTFd API."""
    print(f"[DBG] Fetching challenge list for CTF @ {url}")
    token = ctf_data.get('token') if ctf_data else None
    if not token:
        token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
        if not token:
            return None, f"Could not fetch session token: {err}"

    def _do_fetch(tok):
        hdrs = {'Cookie': f"session={tok}"}
        return requests.get(f"{url}/api/v1/challenges", headers=hdrs, timeout=60)

    try:
        r = _do_fetch(token)

        # Determine whether we need to re-authenticate:
        #   - explicit 401 or 403 from CTFd
        #   - a 200 that is actually an HTML login redirect (expired session)
        needs_reauth = not r.ok and r.status_code in (401, 403)
        if not needs_reauth and r.ok:
            try:
                r.json()  # probe — raises ValueError if HTML was returned
            except ValueError:
                needs_reauth = True
                print(f"[DBG] Non-JSON response from CTFd (likely expired session), re-authenticating")

        if needs_reauth:
            # Evict the stale token so fetch_session_token fetches a fresh one
            if ctf_data:
                ctf_data.pop('token', None)
            token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
            if not token:
                return None, f"Could not fetch session token: {err}"
            r = _do_fetch(token)
            if not r.ok:
                return None, f"CTFd API error after re-auth: {r.status_code} {r.text}"
        elif not r.ok:
            return None, f"CTFd API error: {r.status_code} {r.text}"

        api_data = r.json()
        challenges = api_data.get('data', [])
        if challenges is None:
            return None, f"Unexpected CTFd response (data=null) for CTF @ {url}."
        # An empty list is valid (CTF not started yet) — don't treat it as an error
        if not challenges:
            print(f"[DBG] CTFd returned 0 challenges for CTF @ {url} (CTF may not have started yet)")
        return challenges, None
    except Exception as e:
        return None, f"Error fetching challenges from CTF @ {url}: {e}"

@app.route('/challenges/<int:ctf_id>', methods=['GET'])
def get_challenges(ctf_id):
    """Retrieves the challenges' informations for a specific CTF and cache it."""
    refresh = request.args.get('refresh') == '1'
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': f"CTF #{ctf_id} not found"}), 404
    url = ctf_data.get('url')
    login = ctf_data.get('login')
    password = ctf_data.get('password')
    if (refresh or not ctf_data.get('challenges')) and url and login and password:
        challenges, err_msg = fetch_challenge_list(url, login, password, ctf_data, ctf_id)
        if challenges is None or err_msg:
            return jsonify({'error': err_msg}), 404
        old_solved = {str(ch.get('id')) for ch in (ctf_data.get('challenges') or []) if ch.get('solved_by_me')}
        # Preserve attempts/max_attempts from cached challenge details
        detail_by_id = {str(ch.get('id')): ch for ch in (ctf_data.get('challenge') or [])}
        for ch in challenges:
            if str(ch.get('id')) in old_solved:
                ch['solved_by_me'] = True
            det = detail_by_id.get(str(ch.get('id')))
            if det:
                if 'attempts' in det:
                    ch['attempts'] = det['attempts']
                if 'max_attempts' in det:
                    ch['max_attempts'] = det['max_attempts']
        ctf_data['challenges'] = challenges
        if update_ctf_cache(ctf_id, ctf_data) == False:
            return jsonify({'error': 'Failed to update CTF data'}), 500
    # Annotate challenges at response time from stored detail cache
    detail_by_id = {str(ch.get('id')): ch for ch in (ctf_data.get('challenge') or [])}
    flags = ctf_data.get('flags', [])
    pending_by_chall = set(
        str(f['challenge_id']) for f in flags if f.get('state') == 'untested'
    )
    for ch in ctf_data.get('challenges', []):
        if str(ch.get('id')) in pending_by_chall:
            ch['has_pending_flags'] = True
        else:
            ch.pop('has_pending_flags', None)
        det = detail_by_id.get(str(ch.get('id')))
        if det:
            if 'attempts' in det:
                ch['attempts'] = det['attempts']
            if 'max_attempts' in det:
                ch['max_attempts'] = det['max_attempts']
            # Overlay fresher values from the detail cache so the list view
            # stays in sync without requiring a full list refresh.
            if 'solves' in det:
                ch['solves'] = det['solves']
            if det.get('solved_by_me'):
                ch['solved_by_me'] = True
    return jsonify(ctf_data)

def fetch_challenge(url, login, password, ctf_id, ch_id, ctf_data=None):
    """Fetch details of a challenge from the remote CTFd API."""
    token = ctf_data.get('token') if ctf_data else None
    if not token:
        token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
        if not token:
            return None, f"Could not fetch session token: {err}"
    headers = {'Cookie': f"session={token}"}
    print(f"[DBG] Fetching challenge #{ch_id} details for CTF @ {url}")
    try:
        r = requests.get(f"{url}/api/v1/challenges/{ch_id}", headers=headers, timeout=60)
        if r.ok:
            ch_full = r.json().get('data')
            if not ch_full:
                return None, f"CTFd API no data for challenge #{ch_id}: {r.status_code} {r.text}"
            return ch_full, None
        elif r.status_code == 404:
            # Challenge was deleted from CTFd — signal this explicitly so the
            # caller can clean up the cache rather than just surfacing an error.
            return None, 'CHALLENGE_NOT_FOUND'
        elif r.status_code == 401:
            # Try to refresh token
            token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
            if not token:
                return None, f"Could not fetch session token: {err}"
            headers = {'Cookie': f"session={token}"}
            r = requests.get(f"{url}/api/v1/challenges/{ch_id}", headers=headers, timeout=60)
            if r.ok:
                ch_full = r.json().get('data')
                if not ch_full:
                    return None, f"CTFd API no data for challenge #{ch_id}: {r.status_code} {r.text}"
                return ch_full, None
            else:
                return None, f"CTFd API error: {r.status_code} {r.text}"
    except Exception as e:
        return None, f"Error fetching challenge {ch_id} details: {e}"
    return None, f"Error: cannot fetch details for challenge #{ch_id}), CTF #{ctf_id} @ {url}"

@app.route('/challenge/<int:ctf_id>/<int:chall_id>', methods=['GET'])
def get_challenge(ctf_id, chall_id):
    """Retrieve information about a single challenge for a given CTF and cache it. Also fetch and cache hints if missing."""
    refresh = request.args.get('refresh') == '1'
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': f"CTF #{ctf_id} not found"}), 404
    if ctf_data.get('challenge') is None or not any(str(ch.get('id')) == str(chall_id) for ch in ctf_data.get('challenge', [])):
        refresh = True  # Force refresh only if this specific challenge is not cached
    url = ctf_data.get('url')
    login = ctf_data.get('login')
    password = ctf_data.get('password')
    # Fetch challenge details if needed
    if refresh and url and login and password:
        ch, err_msg = fetch_challenge(url, login, password, ctf_id, chall_id, ctf_data)
        if ch and err_msg is None:
            challenge = ctf_data.get('challenge', [])
            found = False
            for i, c in enumerate(challenge):
                if str(c.get('id')) == str(chall_id):
                    challenge[i] = ch
                    found = True
            if not found and ch.get('id') is not None:
                challenge.append(ch)
            ctf_data['challenge'] = challenge
            if update_ctf_cache(ctf_id, ctf_data) == False:
                return jsonify({'error': 'Failed to update CTF data'}), 500
            # Fetch and cache solves after updating challenge cache
            _fetch_and_cache_challenge_solves(ctf_id, chall_id, ctf_data)
        else:
            if err_msg == 'CHALLENGE_NOT_FOUND':
                # The challenge was deleted from CTFd.  Remove it from the list
                # cache and the detail cache so that get_computed_scores (which
                # iterates ctf_data['challenges']) no longer awards its points,
                # matching CTFd's own recalculated official scores.
                ctf_data['challenges'] = [
                    ch for ch in ctf_data.get('challenges', [])
                    if str(ch.get('id')) != str(chall_id)
                ]
                ctf_data['challenge'] = [
                    ch for ch in ctf_data.get('challenge', [])
                    if str(ch.get('id')) != str(chall_id)
                ]
                update_ctf_cache(ctf_id, ctf_data)
                print(f"[DBG] Challenge #{chall_id} removed from CTF #{ctf_id} cache (deleted on CTFd)")
            return jsonify({'error': err_msg}), 404
    # Extract hints from the challenge details (do not fetch from /hints endpoint)
    # XXX: That may cause a problem if the challenge's hints get rewritten
    challenge_list = ctf_data.get('challenge', [])
    ch_obj = None
    for ch in challenge_list:
        # Compare as string to avoid int/str mismatch
        if str(ch.get('id')) == str(chall_id):
            ch_obj = ch
            break
    # Attach cached hint content if available
    hints = []
    if ch_obj and 'hints' in ch_obj:
        hint_contents = ctf_data.get('hint_contents', {})
        chall_key = str(chall_id)
        for h in ch_obj['hints']:
            h_copy = h.copy()
            if 'id' in h_copy and chall_key in hint_contents and str(h_copy['id']) in hint_contents[chall_key]:
                h_copy['content'] = hint_contents[chall_key][str(h_copy['id'])]
            hints.append(h_copy)
    # Always return hints for this challenge, even if challenge is not found
    flags = [f for f in ctf_data.get('flags', []) if str(f.get('challenge_id')) == str(chall_id)]
    if ch_obj:
        return jsonify({'challenge': ch_obj, 'flags': flags, 'hints': hints})
    else:
        # If challenge not found, still return hints and flags (challenge=None)
        return jsonify({'challenge': None, 'flags': flags, 'hints': hints, 'error': f"Challenge #{chall_id} not found in CTF #{ctf_id}"}), 404

@app.route('/', methods=['GET'])
def serve_frontend():
    """Serves the index.html file (Lit frontend)."""
    return send_from_directory(FRONTEND_DIR, 'index.html')  # Serve index.html

# Add a route for other static files in the frontend directory

import mimetypes

@app.route('/cached_file/<int:ctf_id>/<path:file_path>')
def cached_file(ctf_id, file_path):
    """Serve a CTFd file from local cache, fetching and caching it on first access.
    Pass ?refresh=1 to force re-download from the CTFd server."""
    force_refresh = request.args.get('refresh') == '1'
    full_remote_path = '/' + file_path
    # Strip query string from file_path for the cache key
    cache_rel = os.path.join(str(ctf_id), file_path.split('?')[0])
    dest = os.path.join(CACHE_DIR, cache_rel)

    if os.path.exists(dest) and not force_refresh:
        mime, _ = mimetypes.guess_type(dest)
        with open(dest, 'rb') as fh:
            return app.response_class(fh.read(), mimetype=mime or 'application/octet-stream')

    # Need to fetch from CTFd
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': f'CTF #{ctf_id} not found'}), 404
    url = ctf_data.get('url', '').rstrip('/')
    token = ctf_data.get('token')
    login = ctf_data.get('login')
    password = ctf_data.get('password')
    if not token:
        token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
        if not token:
            return jsonify({'error': f'Could not fetch session token: {err}'}), 502
    headers = {'Cookie': f'session={token}'}
    # Preserve any query string the CTFd URL may carry (e.g. token params)
    qs = request.query_string.decode()
    qs = '&'.join(p for p in qs.split('&') if not p.startswith('refresh='))
    remote_url = url + full_remote_path + (('?' + qs) if qs else '')
    print(f"[DBG] Fetching file for cache: {remote_url}")
    try:
        r = requests.get(remote_url, headers=headers, timeout=60, stream=True)
        if r.status_code == 401:
            token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
            if not token:
                return jsonify({'error': f'Could not fetch session token: {err}'}), 502
            headers = {'Cookie': f'session={token}'}
            r = requests.get(remote_url, headers=headers, timeout=60, stream=True)
        if not r.ok:
            return jsonify({'error': f'Failed to fetch file: {r.status_code}'}), 502
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'wb') as fh:
            for chunk in r.iter_content(chunk_size=65536):
                fh.write(chunk)
    except Exception as e:
        return jsonify({'error': f'Error fetching file: {e}'}), 502

    mime, _ = mimetypes.guess_type(dest)
    with open(dest, 'rb') as fh:
        return app.response_class(fh.read(), mimetype=mime or 'application/octet-stream')

@app.route('/<path:path>')
def serve_static(path):
    """Serves static files from the frontend directory."""
    return send_from_directory(FRONTEND_DIR, path)

def solve_pow(token_b64: str, difficulty: int) -> int:
    """Brute-force the PoW: find nonce s.t. SHA-256(token||nonce_le64) has `difficulty` leading zero bits."""
    # Decode base64url
    import base64
    padding = 4 - len(token_b64) % 4
    token_bytes = base64.urlsafe_b64decode(token_b64 + '=' * (padding % 4))

    nonce = 0
    while True:
        data = token_bytes + struct.pack('<Q', nonce)
        digest = hashlib.sha256(data).digest()
        # Count leading zero bits
        zeros = 0
        for byte in digest:
            if byte == 0:
                zeros += 8
            else:
                for bit in range(7, -1, -1):
                    if (byte >> bit) & 1 == 0:
                        zeros += 1
                    else:
                        break
                break
        if zeros >= difficulty:
            return nonce
        nonce += 1

def fetch_session_token(url, login, password, ctf_data=None, ctf_id=None):
    """Fetch session token from CTFd, handling PoW challenges if present."""
    print(f"[DBG] Fetching session token for CTF @ {url} with login {login}")
    try:
        import re
        s = requests.Session()

        # --- Step 1: Check if PoW is required ---
        r = s.get(f"{url}/login", timeout=60)
        if not r.ok:
            return None, f"Failed to load login page: {r.status_code} {r.text}"

        # If we got the PoW page instead of the real login page
        if '/pow/challenge' in r.text or 'pow-card' in r.text:
            print(f"[DBG] PoW challenge detected, solving...")

            # Fetch the PoW challenge
            pow_r = s.get(f"{url}/pow/challenge", timeout=60)
            if not pow_r.ok:
                return None, f"Failed to fetch PoW challenge: {pow_r.status_code}"
            pow_data = pow_r.json()
            token = pow_data.get('token')
            difficulty = pow_data.get('difficulty')
            if not token or difficulty is None:
                return None, "Invalid PoW challenge payload"

            print(f"[DBG] Solving PoW with difficulty={difficulty}...")
            nonce = solve_pow(token, difficulty)
            print(f"[DBG] PoW solved, nonce={nonce}")

            # Submit the proof
            verify_r = s.post(
                f"{url}/pow/verify",
                json={"token": token, "nonce": nonce},
                timeout=60
            )
            if not verify_r.ok or verify_r.json().get('ok') is not True:
                return None, f"PoW verification failed: {verify_r.status_code} {verify_r.text}"

            # Now fetch the real login page
            r = s.get(f"{url}/login", timeout=60)
            if not r.ok:
                return None, f"Failed to load login page after PoW: {r.status_code}"

        # --- Step 2: Extract csrfNonce from the real login page ---
        m = re.search(r"['\"](?:csrfNonce|session)['\"]\s*:\s*['\"]([a-fA-F0-9]{64})['\"]", r.text)
        if not m:
            print(r.text)
            return None, "Could not find csrfNonce in login page."
        csrf_nonce = m.group(1)

        # --- Step 3: Login ---
        payload = {'name': login, 'password': password, 'nonce': csrf_nonce}
        headers = {'Csrf-Token': csrf_nonce}
        r = s.post(f"{url}/login", data=payload, headers=headers, timeout=60)
        if not r.ok:
            return None, f"Login failed: {r.status_code} {r.text}"

        session_cookie = s.cookies.get('session')
        if not session_cookie:
            return None, "Session cookie not found after login."

        if ctf_data is not None and ctf_id is not None:
            if ctf_data.get('token') != session_cookie:
                ctf_data['token'] = session_cookie
                ctf_data.pop('csrf_nonce', None)  # Nonce is tied to the session; clear it so it gets re-fetched
                update_ctf_cache(ctf_id, ctf_data)
        return session_cookie, None
    except Exception as e:
        return None, f"Exception during login: {e}"

@app.route('/create_ctf', methods=['POST'])
def create_ctf():
    """Handles the creation of a new CTF."""
    url = request.form['url']
    if not url:
        return jsonify({'error': 'URL is required'}), 400
    if not url.startswith(('http://', 'https://')):
        return jsonify({'error': 'URL must start with http:// or https://'}), 400
    url = url.rstrip('/')
    name = request.form['name']
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    login = request.form.get('login', '').strip()
    password = request.form.get('password', '').strip()
    if not login or not password:
        return jsonify({'error': 'Login and password are required'}), 400

    # Assign a unique ID by finding the max existing ID and adding 1
    existing_ids = []
    for filename in os.listdir(DATA_DIR):
        if filename.startswith('ctf_') and filename.endswith('.json'):
            try:
                existing_ids.append(int(filename[4:-5]))
            except ValueError:
                continue
    ctf_id = max(existing_ids, default=-1) + 1

    # Fetch initial session token
    token, err = fetch_session_token(url, login, password)
    if not token:
        return jsonify({'error': f'Could not fetch session token: {err}'}), 400

    filename = os.path.join(DATA_DIR, f"ctf_{ctf_id}.json")
    data = {'url': url, 'name': name, 'login': login, 'password': password, 'token': token, 'challenges': []}

    with open(filename, 'w') as f:
        json.dump(data, f)

    return jsonify({'ctf_id': ctf_id})

def fetch_csrf_nonce(url, token):
    """Fetch CSRF token from CTFd index page using a session token."""
    csrf_nonce = None
    headers = {'Cookie': f"session={token}"}
    print(f"[DBG] Fetching CSRF token for CTF @ {url}")
    try:
        r = requests.get(f"{url}/", headers=headers, timeout=60)
        if not r.ok:
            return None, f"Error fetching the CSRF nonce: {r.status_code} {r.text}"
        import re
        # Use robust regex matching both single/double quotes and whitespace
        m = re.search(r"['\"]csrfNonce['\"]\s*:\s*['\"]([a-fA-F0-9]{64})['\"]", r.text)
        if m:
            csrf_nonce = m.group(1)
    except Exception as e:
        return None, f"Error: Could not fetch CSRF token: {e}"
    if csrf_nonce is None:
        return None, "Error: Could not find csrfNonce in CTFd index page response!"
    return csrf_nonce, None

def get_csrf_nonce(url, token, ctf_data=None, ctf_id=None):
    """Return a cached CSRF nonce for the current session, fetching and caching it on first use.
    The nonce is session-stable in CTFd, so one GET / per session is enough."""
    cached = ctf_data.get('csrf_nonce') if ctf_data else None
    if cached:
        return cached, None
    nonce, err = fetch_csrf_nonce(url, token)
    if nonce and ctf_data is not None and ctf_id is not None:
        ctf_data['csrf_nonce'] = nonce
        update_ctf_cache(ctf_id, ctf_data)
    return nonce, err

@app.route('/test_flag/<int:ctf_id>/<int:chall_id>/<int:flag_id>', methods=['POST'])
def test_flag(ctf_id, chall_id, flag_id):
    """Submits a flag to the CTFd API and returns the result. Updates flag state based on response."""
    if ctf_id is None or chall_id is None or flag_id is None:
        return jsonify({'error': 'Missing input field(s)'}), 400
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': 'CTF not found'}), 404
    flags = ctf_data.get('flags', [])
    flag_obj = next((f for f in flags if f.get('challenge_id') == chall_id and f.get('id') == flag_id), None)
    if not flag_obj:
        return jsonify({'error': f"Flag #{flag_id} for challenge #{chall_id} CTF #{ctf_id} not found"}), 404
    flag = flag_obj.get('submission')
    url = ctf_data.get('url')
    login = ctf_data.get('login')
    password = ctf_data.get('password')
    token = ctf_data.get('token')
    if not token:
        token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
        if not token:
            return jsonify({'error': f"Could not fetch session token: {err}"}), 502
    # Fetch CSRF token (cached per session; only hits the network on first use or after re-login)
    csrf_nonce, err_msg = get_csrf_nonce(url, token, ctf_data, ctf_id)
    if csrf_nonce is None or err_msg:
        return jsonify({'error': err_msg}), 502
    headers = {'Cookie': f"session={token}", 'Csrf-Token': csrf_nonce}
    print(f"[DBG] Testing {flag=} for challenge #{chall_id} to CTF @ {url}")
    try:
        r = requests.post(f"{url}/api/v1/challenges/attempt", headers=headers, json={'challenge_id': chall_id, 'submission': flag}, timeout=60)
        if not r.ok:
            # Try to refresh token if unauthorized
            if r.status_code == 401:
                token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
                if not token:
                    return jsonify({'success': False, 'error': f"Could not fetch session token: {err}"}), 502
                csrf_nonce, err_msg = get_csrf_nonce(url, token, ctf_data, ctf_id)
                if csrf_nonce is None or err_msg:
                    return jsonify({'success': False, 'error': err_msg}), 502
                headers = {'Cookie': f"session={token}", 'Csrf-Token': csrf_nonce}
                r = requests.post(f"{url}/api/v1/challenges/attempt", headers=headers, json={'challenge_id': chall_id, 'submission': flag}, timeout=60)
                if not r.ok:
                    return jsonify({'success': False, 'error': f"CTFd API error: {r.status_code} {r.text}"}), 502
            else:
                return jsonify({'success': False, 'error': f"CTFd API error: {r.status_code} {r.text}"}), 502
        try:
            resp = r.json()
        except Exception as e:
            return jsonify({'success': False, 'error': f"Malformed response from CTFd server: {e}", 'raw': r.text}), 502
        # Update flag state based on response
        data = resp.get('data')
        # Ensure data is always a list for frontend compatibility
        if data is not None and not isinstance(data, list):
            resp['data'] = [data]
            data = resp['data']
        if isinstance(data, list) and data:
            status = data[0].get('status')
            if status == 'correct':
                flag_obj['state'] = 'valid'
                # Mark the challenge as solved in both caches (list and detail)
                for ch in (ctf_data.get('challenges') or []):
                    if str(ch.get('id')) == str(chall_id):
                        ch['solved_by_me'] = True
                        break
                for ch in (ctf_data.get('challenge') or []):
                    if str(ch.get('id')) == str(chall_id):
                        ch['solved_by_me'] = True
                        break
            elif status == 'incorrect':
                flag_obj['state'] = 'invalid'
            # Update ctf_data['flags'] with the modified flag_obj
            for i, f in enumerate(ctf_data.get('flags', [])):
                if f.get('challenge_id') == chall_id and f.get('id') == flag_id:
                    ctf_data['flags'][i] = flag_obj
                    break
            if update_ctf_cache(ctf_id, ctf_data) == False:
                return jsonify({'success': False, 'error': 'Failed to update CTF data'}), 500
        return jsonify({'success': True, 'data': resp})
    except Exception as e:
        return jsonify({'success': False, 'error': f"Error submitting flag: {e}"}), 500

@app.route('/add_flag/<int:ctf_id>/<int:chall_id>', methods=['POST'])
def add_candidate_flag(ctf_id, chall_id):
    """Add a flag (to test later) for a specific challenge."""
    data = request.get_json()
    flag = data.get('flag', '').strip()
    if not flag:
        return jsonify({'error': 'No flag provided'}), 400
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': 'CTF not found'}), 404
    # Check if the flag is already present for the challenge
    flags = ctf_data.setdefault('flags', [])
    for f in flags:
        if f.get('challenge_id') == chall_id and f.get('submission', '').strip() == flag:
            return jsonify({'error': 'Flag already exists for this challenge'}), 400
    # Add the new flag for the challenge
    flag_id = max([f.get('id', 0) for f in flags if f.get('challenge_id') == chall_id] + [-1]) + 1
    flags.append({'id': flag_id, 'challenge_id': chall_id, 'submission': flag, 'state': 'untested'})
    ctf_data['flags'] = flags
    if not update_ctf_cache(ctf_id, ctf_data):
        return jsonify({'error': 'Failed to update CTF data'}), 500
    return jsonify({'success': True, 'flag_id': flag_id})

@app.route('/remove_flag/<int:ctf_id>/<int:chall_id>', methods=['POST'])
def del_candidate_flag(ctf_id, chall_id):
    """Remove a flag for a specific challenge."""
    data = request.get_json()
    flag_id = data.get('flag_id')
    if flag_id is None:
        return jsonify({'error': 'No flag ID provided'}), 400
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': 'CTF not found'}), 404
    flags = ctf_data.get('flags', [])
    # Find and remove the flag
    for i, f in enumerate(flags):
        if f.get('id') == flag_id and f.get('challenge_id') == chall_id:
            del flags[i]
            ctf_data['flags'] = flags
            if update_ctf_cache(ctf_id, ctf_data) == False:
                return jsonify({'error': 'Failed to update CTF data'}), 500
            return jsonify({'success': True})
    return jsonify({'error': 'Flag not found'}), 404

@app.route('/delete_flags/<int:ctf_id>/<int:chall_id>', methods=['POST'])
def delete_flags(ctf_id, chall_id):
    """Delete all flags for a specific challenge."""
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': 'CTF not found'}), 404
    flags = ctf_data.get('flags', [])
    # Remove all flags for the given challenge
    new_flags = [f for f in flags if f.get('challenge_id') != chall_id]
    ctf_data['flags'] = new_flags
    if not update_ctf_cache(ctf_id, ctf_data):
        return jsonify({'error': 'Failed to update CTF data'}), 500
    return jsonify({'success': True, 'deleted': len(flags) - len(new_flags)})

def _fetch_and_cache_challenge_solves(ctf_id, chall_id, ctf_data=None):
    """Fetch and cache the list of users who solved a specific challenge from the remote CTFd server. Returns (solves, error_msg)."""
    if ctf_data is None:
        ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return None, 'CTF not found'
    url = ctf_data.get('url')
    login = ctf_data.get('login')
    password = ctf_data.get('password')
    if not url or not login or not password:
        return None, 'Missing CTFd URL, login, or password'
    solves = ctf_data.get('solves', {})
    cache_key = str(chall_id)
    challenges = ctf_data.get('challenges') or []
    challenge_summary = next((c for c in challenges if str(c.get('id')) == str(chall_id)), None)
    summary_solves = None
    if challenge_summary and 'solves' in challenge_summary:
        try:
            summary_solves = int(challenge_summary['solves'])
        except Exception:
            pass
    cached_solves = solves.get(cache_key, [])
    # The detail cache (ctf_data['challenge']) is populated by get_challenge and
    # may be fresher than the list cache.  Take the max of both so a single new
    # solve is never silently skipped by the early-return guard.
    for det in ctf_data.get('challenge', []):
        if str(det.get('id')) == cache_key:
            try:
                det_solves = int(det.get('solves', 0))
                if summary_solves is None or det_solves > summary_solves:
                    summary_solves = det_solves
            except Exception:
                pass
            break
    # Only skip the remote fetch when the cached list already has the right count.
    if summary_solves is not None and len(cached_solves) == summary_solves:
        return cached_solves, None
    token = ctf_data.get('token')
    if not token:
        token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
        if not token:
            return None, f"Could not fetch session token: {err}"
    headers = {'Cookie': f"session={token}"}
    print(f"[DBG] Fetching solves for challenge #{chall_id} in CTF @ {url}")
    try:
        # CTFd paginates the solves endpoint (default 50 per page, oldest-first).
        # Fetching only page 1 silently drops the most recent solvers on later
        # pages, so we loop until there is no next page.
        fresh_solves = []
        page = 1
        while True:
            api_url = f"{url}/api/v1/challenges/{chall_id}/solves?page={page}"
            r = requests.get(api_url, headers=headers, timeout=60)
            if not r.ok:
                if r.status_code == 401:
                    token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
                    if not token:
                        return None, f"Could not fetch session token: {err}"
                    headers = {'Cookie': f"session={token}"}
                    r = requests.get(api_url, headers=headers, timeout=60)
                    if not r.ok:
                        return None, f"CTFd API error: {r.status_code} {r.text}"
                else:
                    return None, f"CTFd API error: {r.status_code} {r.text}"
            data       = r.json()
            page_data  = data.get('data', [])
            fresh_solves.extend(page_data)
            next_page  = data.get('meta', {}).get('pagination', {}).get('next')
            if not page_data or not next_page:
                break
            page = next_page
        fresh_ids = {str(s.get('account_id')) for s in fresh_solves}

        # Maintain ghost_solves: solvers absent from fresh CTFd data (likely banned).
        # Their entries are kept so /computed_scores can recompute with current values.
        if 'solves' not in ctf_data:
            ctf_data['solves'] = {}
        if 'ghost_solves' not in ctf_data:
            ctf_data['ghost_solves'] = {}

        existing_cached = ctf_data['solves'].get(cache_key, [])
        existing_ghost  = ctf_data['ghost_solves'].get(cache_key, [])
        ghost_ids       = {str(s.get('account_id')) for s in existing_ghost}

        # Solvers in old cache but gone from CTFd → add to ghost (once only)
        # Also update banned_players with their solve date as a last_seen candidate.
        banned_players_map = ctf_data.setdefault('banned_players', {})
        for s in existing_cached:
            aid = str(s.get('account_id'))
            if aid not in fresh_ids and aid not in ghost_ids:
                existing_ghost.append(s)
                solve_date = s.get('date', '')
                existing_bp = banned_players_map.get(aid, {})
                existing_ls = existing_bp.get('last_seen', '')
                candidates = [c for c in [existing_ls, solve_date] if c]
                banned_players_map[aid] = {
                    'name': existing_bp.get('name') or s.get('name', ''),
                    'last_seen': max(candidates) if candidates else solve_date,
                }

        # Solvers back in CTFd → remove from ghost (they were unbanned)
        existing_ghost = [s for s in existing_ghost if str(s.get('account_id')) not in fresh_ids]

        ctf_data['solves'][cache_key]       = fresh_solves
        ctf_data['ghost_solves'][cache_key] = existing_ghost

        # Propagate the authoritative solve count back into both caches so
        # page reloads and the list view serve the correct number immediately.
        fresh_count = len(fresh_solves)
        for ch in ctf_data.get('challenges', []):
            if str(ch.get('id')) == cache_key:
                ch['solves'] = fresh_count
                break
        for ch in ctf_data.get('challenge', []):
            if str(ch.get('id')) == cache_key:
                ch['solves'] = fresh_count
                break

        if update_ctf_cache(ctf_id, ctf_data) == False:
            return None, 'Failed to update CTF data'
        return fresh_solves, None
    except Exception as e:
        return None, f"Exception occurred: {e}"

@app.route('/solves/<int:ctf_id>/<int:chall_id>', methods=['GET'])
def get_challenge_solves(ctf_id, chall_id):
    """Fetch and cache the list of users who solved a specific challenge from the remote CTFd server."""
    solves, err = _fetch_and_cache_challenge_solves(ctf_id, chall_id)
    if err:
        return jsonify({'error': err}), 500 if 'Exception' in err or 'Failed' in err else 404
    return jsonify({'solves': solves})

@app.route('/scoreboard/<int:ctf_id>', methods=['GET'])
def get_scoreboard(ctf_id):
    """Return the cached scoreboard. Only fetches from CTFd when ?refresh=1 or no data cached."""
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': f"CTF #{ctf_id} not found"}), 404
    force_refresh = request.args.get('refresh') == '1'
    if not force_refresh and ctf_data.get('scoreboard'):
        return jsonify(ctf_data['scoreboard'])
    url      = ctf_data.get('url')
    login    = ctf_data.get('login')
    password = ctf_data.get('password')
    if not url or not login or not password:
        return jsonify({'error': 'Missing CTF credentials'}), 400
    token = ctf_data.get('token')
    if not token:
        token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
        if not token:
            return jsonify({'error': f"Could not fetch session token: {err}"}), 502
    headers = {'Cookie': f"session={token}"}
    print(f"[DBG] Fetching scoreboard for CTF @ {url}")
    try:
        r = requests.get(f"{url}/api/v1/scoreboard", headers=headers, timeout=30)
        if r.status_code == 401:
            token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
            if not token:
                return jsonify({'error': f"Could not fetch session token: {err}"}), 502
            headers = {'Cookie': f"session={token}"}
            r = requests.get(f"{url}/api/v1/scoreboard", headers=headers, timeout=30)
        if not r.ok:
            return jsonify({'error': f"CTFd API error: {r.status_code} {r.text}"}), 502
        result = r.json()
        # Strip the useless 'success' key before persisting, and record when
        # this fetch happened so the frontend can display a stable timestamp.
        stored = {k: v for k, v in result.items() if k != 'success'}
        stored['last_updated'] = datetime.now(timezone.utc).isoformat()
        last_updated = stored['last_updated']

        # ── Banned-player detection ───────────────────────────────────────────
        # Compare old vs new scoreboard to find players who disappeared.
        # For each disappeared player, last_seen = max of:
        #   • the previous scoreboard's last_updated  — they were confirmed present
        #     on that fetch, so that timestamp IS their last-seen-on-scoreboard time
        #   • their most recent solve date (from solves / ghost_solves), in case
        #     they solved something after the last scoreboard snapshot
        old_scoreboard   = ctf_data.get('scoreboard') or {}
        prev_sb_updated  = old_scoreboard.get('last_updated', '')  # last confirmed-present time
        new_sb_data = stored.get('data', []) or []
        new_ids_set = {str(e.get('account_id')) for e in new_sb_data if e.get('account_id')}
        old_sb_data = old_scoreboard.get('data', []) or []
        old_ids_set = {str(e.get('account_id')) for e in old_sb_data if e.get('account_id')}
        disappeared = old_ids_set - new_ids_set
        if disappeared:
            banned_players_map = ctf_data.setdefault('banned_players', {})
            old_name_by_id  = {str(e.get('account_id')): e.get('name', '') for e in old_sb_data}
            ghost_solves_all = ctf_data.get('ghost_solves', {})
            solves_all       = ctf_data.get('solves', {})
            for aid in disappeared:
                # Find the player's latest solve date across both caches
                last_solve_date = ''
                for chall_solves in list(ghost_solves_all.values()) + list(solves_all.values()):
                    for s in (chall_solves or []):
                        if str(s.get('account_id')) == aid:
                            d = s.get('date', '')
                            if d > last_solve_date:
                                last_solve_date = d
                existing_bp = banned_players_map.get(aid, {})
                existing_ls = existing_bp.get('last_seen', '')
                candidates  = [c for c in [existing_ls, prev_sb_updated, last_solve_date] if c]
                banned_players_map[aid] = {
                    'name':      existing_bp.get('name') or old_name_by_id.get(aid, ''),
                    'last_seen': max(candidates) if candidates else last_updated,
                }
        # ─────────────────────────────────────────────────────────────────────

        ctf_data['scoreboard'] = stored
        update_ctf_cache(ctf_id, ctf_data)
        return jsonify(stored)
    except Exception as e:
        return jsonify({'error': f"Exception fetching scoreboard: {e}"}), 500

@app.route('/computed_scores/<int:ctf_id>', methods=['GET'])
def get_computed_scores(ctf_id):
    """Aggregate per-user scores from cached solve lists plus ghost_solves (banned players).
    Both sets are scored against current challenge values so dynamic scoring stays accurate.
    Never triggers a remote fetch — only reads what the challenge refresh already stored."""
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': f"CTF #{ctf_id} not found"}), 404
    challenges    = ctf_data.get('challenges') or []
    cached_solves = ctf_data.get('solves') or {}
    ghost_solves  = ctf_data.get('ghost_solves') or {}
    scores = {}   # str(account_id) -> { name, score }
    for ch in challenges:
        ch_id = ch.get('id')
        val   = int(ch.get('value') or 0)
        if not ch_id:
            continue
        key = str(ch_id)
        # Regular solvers + ghost solvers scored at current challenge value
        for s in (cached_solves.get(key) or []) + (ghost_solves.get(key) or []):
            aid = str(s.get('account_id', ''))
            if not aid:
                continue
            if aid not in scores:
                scores[aid] = {'name': s.get('name', f'#{aid}'), 'score': 0}
            scores[aid]['score'] += val

    # Attach last_seen for every ghost (banned) account.
    # Recompute as max(stored_value, all_cached_solve_dates) so that last_seen is
    # never earlier than the player's latest visible solve, even if banned_players
    # was persisted before all solves were moved to ghost_solves.
    banned_players_data = ctf_data.get('banned_players') or {}

    # Pass 1: collect ghost account IDs and their latest solve date across all caches.
    ghost_account_ids: set[str] = set()
    latest_solve_date: dict[str, str] = {}   # aid -> max date seen in any cache
    for solve_list in ghost_solves.values():
        for s in (solve_list or []):
            aid = str(s.get('account_id', ''))
            if not aid:
                continue
            ghost_account_ids.add(aid)
            d = s.get('date', '')
            if d and d > latest_solve_date.get(aid, ''):
                latest_solve_date[aid] = d
    # Also scan regular solves in case some haven't been moved to ghost yet
    for solve_list in cached_solves.values():
        for s in (solve_list or []):
            aid = str(s.get('account_id', ''))
            if aid not in ghost_account_ids:
                continue
            d = s.get('date', '')
            if d and d > latest_solve_date.get(aid, ''):
                latest_solve_date[aid] = d

    # Pass 2: compute best last_seen = max(stored scoreboard component, latest solve)
    for aid in ghost_account_ids:
        if aid in scores:
            bp      = banned_players_data.get(aid, {})
            best_ls = bp.get('last_seen', '')
            solve_d = latest_solve_date.get(aid, '')
            if solve_d and solve_d > best_ls:
                best_ls = solve_d
            if best_ls:
                scores[aid]['last_seen'] = best_ls

    return jsonify({'scores': scores})

@app.route('/player/<int:ctf_id>/<int:user_id>', methods=['GET'])
def get_player_stats(ctf_id, user_id):
    """Return all cached solves for one player, enriched with challenge metadata.

    Built entirely from the in-memory / JSON cache — never triggers a remote
    fetch.  The caller (ctf-player-box.js) therefore gets sub-millisecond
    responses once challenges have been refreshed at least once.

    Response schema
    ---------------
    {
      "user_id": 42,
      "solve_count": 7,
      "total_score": 1750,
      "solves": [
        {
          "challenge_id": 3,
          "name":         "Super Easy Flag",
          "category":     "Misc",
          "value":        100,
          "date":         "2024-04-06T14:22:00Z",
          "account_id":   42,
          "account_name": "hacker42"
        },
        ...
      ]
    }

    Solves are returned sorted by date ascending so the frontend can build the
    cumulative score timeline without an extra sort.
    """
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': f"CTF #{ctf_id} not found"}), 404

    # Build a unified challenge-metadata lookup.
    # The detail cache ('challenge') has richer info (name, value, category);
    # fall back to the list cache ('challenges') when a detail entry is absent.
    ch_by_id = {}
    for ch in (ctf_data.get('challenges') or []):
        cid = str(ch.get('id', ''))
        if cid:
            ch_by_id[cid] = ch
    for ch in (ctf_data.get('challenge') or []):
        cid = str(ch.get('id', ''))
        if not cid:
            continue
        if cid in ch_by_id:
            # Merge: prefer non-None values from the detail entry
            merged = dict(ch_by_id[cid])
            for k, v in ch.items():
                if v is not None:
                    merged[k] = v
            ch_by_id[cid] = merged
        else:
            ch_by_id[cid] = ch

    solves_cache       = ctf_data.get('solves', {})
    ghost_solves_cache = ctf_data.get('ghost_solves', {})
    player_solves  = []
    found_chall_ids: set[str] = set()  # de-duplicate across regular + ghost caches

    def _append_solve(chall_id_str, solve):
        ch = ch_by_id.get(chall_id_str, {})
        player_solves.append({
            'challenge_id': int(chall_id_str) if chall_id_str.isdigit() else chall_id_str,
            'name':         ch.get('name') or ch.get('title') or f'Challenge #{chall_id_str}',
            'category':     ch.get('category') or 'Uncategorized',
            'value':        ch.get('value') or 0,
            'date':         solve.get('date') or '',
            'account_id':   solve.get('account_id'),
            'account_name': solve.get('name') or '',
        })
        found_chall_ids.add(chall_id_str)

    for chall_id_str, solve_list in solves_cache.items():
        for solve in (solve_list or []):
            if str(solve.get('account_id', '')) != str(user_id):
                continue
            _append_solve(chall_id_str, solve)
            break  # each challenge is solved at most once per user

    # Also search ghost_solves for banned players whose solves were moved there
    for chall_id_str, solve_list in ghost_solves_cache.items():
        if chall_id_str in found_chall_ids:
            continue
        for solve in (solve_list or []):
            if str(solve.get('account_id', '')) != str(user_id):
                continue
            _append_solve(chall_id_str, solve)
            break

    # Sort ascending by date so the frontend can build a timeline left-to-right
    player_solves.sort(key=lambda s: s.get('date') or '')

    total_score = sum(int(s.get('value') or 0) for s in player_solves)

    # Determine whether this player is banned (present in any ghost_solves entry)
    is_banned = any(
        any(str(s.get('account_id')) == str(user_id) for s in (sl or []))
        for sl in ghost_solves_cache.values()
    )
    last_seen_date = None
    if is_banned:
        bp = (ctf_data.get('banned_players') or {}).get(str(user_id), {})
        # Start from the stored value (which holds the scoreboard component), then
        # take the max with every solve date we actually have cached.  This corrects
        # cases where banned_players was written before all solves were moved to
        # ghost_solves, leaving last_seen earlier than the player's latest activity.
        best_ls = bp.get('last_seen', '')
        for s in player_solves:
            d = s.get('date', '')
            if d and d > best_ls:
                best_ls = d
        last_seen_date = best_ls or None

    return jsonify({
        'user_id':     user_id,
        'solve_count': len(player_solves),
        'total_score': total_score,
        'solves':      player_solves,
        'banned':      is_banned,
        'last_seen':   last_seen_date,
    })

@app.route('/ctfd_title', methods=['POST'])
def get_ctfd_title():
    """Fetch the <title> of the remote CTFd index page and return it as JSON."""
    url = request.json.get('url', '').strip()
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    if not url.startswith('http://') and not url.startswith('https://'):
        url = 'https://' + url
    try:
        print(f"[DBG] Fetching title for CTF @ {url}")
        r = requests.get(url, timeout=15)
        if not r.ok:
            return jsonify({'error': f'Failed to fetch: {r.status_code}'}), 400
        import re
        m = re.search(r'<title>(.*?)</title>', r.text, re.IGNORECASE | re.DOTALL)
        if m:
            return jsonify({'title': m.group(1).strip()})
        else:
            return jsonify({'error': 'No <title> found'}), 400
    except Exception as e:
        return jsonify({'error': f'Exception: {e}'}), 500

@app.route('/delete_ctf/<int:ctf_id>', methods=['DELETE'])
def delete_ctf(ctf_id):
    """Delete a CTF and its data file."""
    filename = os.path.join(DATA_DIR, f"ctf_{ctf_id}.json")
    try:
        if os.path.exists(filename):
            os.remove(filename)
            # Also clear cache if this was the cached CTF
            global _ctf_data_cache
            if _ctf_data_cache.get('ctf_id') == ctf_id:
                _ctf_data_cache['ctf_id'] = None
                _ctf_data_cache['data'] = None
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'CTF not found'}), 404
    except Exception as e:
        return jsonify({'error': f'Failed to delete CTF: {e}'}), 500

@app.route('/ctf/<int:ctf_id>/credentials', methods=['POST'])
def update_ctf_credentials(ctf_id):
    """Update login and password for a CTF, and refresh session token."""
    data = request.get_json()
    login = data.get('login', '').strip()
    password = data.get('password', '').strip()
    if not login or not password:
        return jsonify({'error': 'Login and password are required.'}), 400
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': 'CTF not found.'}), 404
    url = ctf_data.get('url')
    if not url:
        return jsonify({'error': 'CTF URL missing.'}), 400
    # Fetch new session token
    token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
    if not token:
        return jsonify({'error': f'Could not fetch session token: {err}'}), 400
    ctf_data['login'] = login
    ctf_data['password'] = password
    ctf_data['token'] = token
    if not update_ctf_cache(ctf_id, ctf_data):
        return jsonify({'error': 'Failed to update CTF data.'}), 500
    return jsonify({'success': True})

@app.route('/ctf/<int:ctf_id>/settings', methods=['POST'])
def update_ctf_settings(ctf_id):
    """Update miscellaneous settings for a CTF (e.g. refresh_delay)."""
    data = request.get_json()
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': 'CTF not found.'}), 404
    if 'refresh_delay' in data:
        ctf_data['refresh_delay'] = int(data['refresh_delay'])
    if not update_ctf_cache(ctf_id, ctf_data):
        return jsonify({'error': 'Failed to update CTF data.'}), 500
    return jsonify({'success': True})

@app.route('/hint/<int:ctf_id>/<int:chall_id>/<int:hint_id>', methods=['GET'])
def get_hint_content(ctf_id, chall_id, hint_id):
    """Fetch and cache the content for a specific hint only when requested. Store content in ctf_data['hint_contents'][chall_id][hint_id]."""
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        print(f"[ERR] CTF #{ctf_id} not found in cache")
        return jsonify({'error': 'CTF not found'}), 404
    url = ctf_data.get('url')
    login = ctf_data.get('login')
    password = ctf_data.get('password')
    if not url or not login or not password:
        print(f"[ERR] CTF #{ctf_id} not found in cache")
        return jsonify({'error': 'Missing CTF credentials'}), 400
    # Use a separate cache for hint contents
    hint_contents = ctf_data.setdefault('hint_contents', {})
    chall_key = str(chall_id)
    hint_key = str(hint_id)
    if chall_key not in hint_contents:
        hint_contents[chall_key] = {}
    # If content is already cached, return it
    if hint_key in hint_contents[chall_key]:
        return jsonify({'content': hint_contents[chall_key][hint_key]})
    # Fetch content from remote
    token = ctf_data.get('token')
    if not token:
        token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
        if not token:
            print(f"[ERR] CTF #{ctf_id} not found in cache")
            return jsonify({'error': f"Could not fetch session token: {err}"}), 502
    headers = {'Cookie': f"session={token}"}
    print(f"[DBG] Fetching hint content for challenge #{chall_id}, hint #{hint_id} in CTF @ {url}")
    try:
        api_url = f"{url}/api/v1/hints/{hint_id}"
        # First, try to fetch the hint details
        r = requests.get(api_url, headers=headers, timeout=30)
        if not r.ok:
            # Try to refresh token if unauthorized
            if r.status_code == 401:
                token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
                if not token:
                    print(f"[ERR] CTF #{ctf_id} not found in cache")
                    return jsonify({'error': f"Could not fetch session token: {err}"}), 502
                headers = {'Cookie': f"session={token}"}
                r = requests.get(api_url, headers=headers, timeout=30)
                if not r.ok:
                    print(f"[ERR] CTF #{ctf_id} not found in cache")
                    return jsonify({'error': f"CTFd API error: {r.status_code} {r.text}"}), 502
            else:
                print(f"[ERR] CTF #{ctf_id} not found in cache")
                return jsonify({'error': f"CTFd API error: {r.status_code} {r.text}"}), 502
        data = r.json().get('data', {})
        content = data.get('content') or data.get('description') or ''
        # If content is present, cache and return it
        if content:
            hint_contents[chall_key][hint_key] = content
            ctf_data['hint_contents'] = hint_contents
            update_ctf_cache(ctf_id, ctf_data)
            return jsonify({'content': content})
        # If no content, try to unlock the hint
        # Fetch CSRF token for unlocks (cached per session)
        csrf_nonce, err_msg = get_csrf_nonce(url, token, ctf_data, ctf_id)
        if csrf_nonce is None or err_msg:
            return jsonify({'error': err_msg or 'Could not fetch CSRF token for unlock'}), 502
        unlock_url = f"{url}/api/v1/unlocks"
        unlock_payload = {"target": int(hint_id), "type": "hints"}
        unlock_headers = headers.copy()
        unlock_headers['Content-Type'] = 'application/json'
        unlock_headers['Csrf-Token'] = csrf_nonce
        print(f"[DBG] Unlocking hint {hint_id} for challenge {chall_id}, CTF {ctf_id}")
        unlock_resp = requests.post(unlock_url, headers=unlock_headers, json=unlock_payload, timeout=30)
        print(unlock_payload)
        print(f"[DBG] Unlocking hint {hint_id} for challenge {chall_id}, CTF {ctf_id}: {unlock_resp.status_code} {unlock_resp.text}")
        if not unlock_resp.ok:
            return jsonify({'error': f"Failed to unlock hint: {unlock_resp.status_code} {unlock_resp.text}"}), 502
        unlock_data = unlock_resp.json()
        if not unlock_data.get('success'):
            return jsonify({'error': f"Failed to unlock hint: {unlock_data.get('error', 'Unknown error')}"}), 502
        # After unlocking, fetch the hint details again
        r2 = requests.get(api_url, headers=headers, timeout=30)
        if not r2.ok:
            return jsonify({'error': f"CTFd API error after unlock: {r2.status_code} {r2.text}"}), 502
        data2 = r2.json().get('data', {})
        content2 = data2.get('content') or data2.get('description') or ''
        if content2:
            hint_contents[chall_key][hint_key] = content2
            ctf_data['hint_contents'] = hint_contents
            update_ctf_cache(ctf_id, ctf_data)
        return jsonify({'content': content2})
    except Exception as e:
        return jsonify({'error': f"Failed to fetch hint content: {e}"}), 500

@app.route('/<int:ctf_id>/users/<int:user_id>', methods=['GET'])
def get_user_challenges(ctf_id, user_id):
    """
    Returns only a list of challenge ids solved by the user.
    """
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': f"CTF #{ctf_id} not found"}), 404
    challenges   = ctf_data.get('challenges', [])
    solves_cache = ctf_data.get('solves', {})
    ghost_solves = ctf_data.get('ghost_solves', {})
    solved_ids = []
    for ch in challenges:
        chall_id  = ch.get('id')
        chall_key = str(chall_id)
        # Check regular solves first, then ghost_solves (banned players)
        for solve in solves_cache.get(chall_key, []) + ghost_solves.get(chall_key, []):
            if str(solve.get('account_id')) == str(user_id):
                solved_ids.append(chall_id)
                break
    return jsonify({'ctf_id': ctf_id, 'solved_ids': solved_ids})

if __name__ == '__main__':
    if not os.path.isdir(FRONTEND_DIR):
        print('Error: cannot find the frontend directory.')
        sys.exit(1)
    # Create DATA_DIR if needed
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(CACHE_DIR, exist_ok=True)
    from werkzeug.serving import make_server
    server = make_server('127.0.0.1', 5000, app)
    webbrowser.open('http://127.0.0.1:5000', new=1)
    server.serve_forever()
