#!/usr/bin/env python3

import os
from flask import Flask, jsonify, request, send_from_directory
import json
from datetime import datetime
import requests
import webbrowser
import sys

app = Flask(__name__)
DATA_DIR = 'data'

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
                        # add other fields if needed
                    }
                    ctf_list.append(ctf_entry)
                    # Track the last login found (most recent file wins)
                    if data.get('login'):
                        last_login = data.get('login')
            except Exception:
                pass
    return jsonify({'ctfs': ctf_list, 'last_login': last_login})

@app.route('/challenges_details/<int:ctf_id>', methods=['GET'])
def get_all_challenge_details(ctf_id):
    """Returns the full CTF JSON file (all details, all challenges, all fields)."""
    ctf_data = load_ctf_cache(ctf_id)
    if ctf_data is None:
        return jsonify({'error': f"CTF #{ctf_id} not found"}), 404
    return jsonify(ctf_data)

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
    headers = {'Cookie': f"session={token}"}
    try:
        r = requests.get(f"{url}/api/v1/challenges", headers=headers, timeout=60)
        if not r.ok:
            # Try to refresh token if unauthorized
            if r.status_code == 401:
                token, err = fetch_session_token(url, login, password, ctf_data, ctf_id)
                if not token:
                    return None, f"Could not fetch session token: {err}"
                headers = {'Cookie': f"session={token}"}
                r = requests.get(f"{url}/api/v1/challenges", headers=headers, timeout=60)
                if not r.ok:
                    return None, f"CTFd API error: {r.status_code} {r.text}"
            else:
                return None, f"CTFd API error: {r.status_code} {r.text}"
        api_data = r.json()
        challenges = api_data.get('data', [])
        if not challenges:
            return None, f"Error: no challenges found for CTF @ {url}."
    except Exception as e:
        return None, f"Error fetching challenges from CTF @ {url}: {e}"
    return challenges, None

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
        ctf_data['challenges'] = challenges
        if update_ctf_cache(ctf_id, ctf_data) == False:
            return jsonify({'error': 'Failed to update CTF data'}), 500
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
    if ctf_data.get('challenge') is None:
        refresh = True  # Force refresh if no challenge data is cached
    elif not any(str(ch.get('id')) == str(chall_id) for ch in ctf_data.get('challenge', [])):
        # If the challenge with chall_id is not in the cached list, force refresh
        refresh = True
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
@app.route('/<path:path>')
def serve_static(path):
    """Serves static files from the frontend directory."""
    return send_from_directory(FRONTEND_DIR, path)

def fetch_session_token(url, login, password, ctf_data=None, ctf_id=None):
    """Fetch session token from CTFd using login and password. If ctf_data and ctf_id are provided, update the cache if the token changes."""
    print(f"[DBG] Fetching session token for CTF @ {url} with login {login}")
    try:
        s = requests.Session()
        # Get CSRF token from login page
        r = s.get(f"{url}/login", timeout=60)
        if not r.ok:
            return None, f"Failed to load login page: {r.status_code} {r.text}"
        import re
        # Updated regex: match both single and double quotes, allow whitespace/newlines
        m = re.search(r"['\"]csrfNonce['\"]\s*:\s*['\"]([a-fA-F0-9]{64})['\"]", r.text)
        if not m:
            return None, "Could not find csrfNonce in login page."
        csrf_nonce = m.group(1)
        # Send as form data, not JSON
        payload = {
            'name': login,
            'password': password,
            'nonce': csrf_nonce
        }
        headers = {
            'Csrf-Token': csrf_nonce
        }
        r = s.post(f"{url}/login", data=payload, headers=headers, timeout=60)
        if not r.ok:
            return None, f"Login failed: {r.status_code} {r.text}"
        # Session cookie is set in the session
        session_cookie = s.cookies.get('session')
        if not session_cookie:
            return None, "Session cookie not found after login."
        # If ctf_data and ctf_id are provided, update the cache if token changed
        if ctf_data is not None and ctf_id is not None:
            if ctf_data.get('token') != session_cookie:
                ctf_data['token'] = session_cookie
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
    # Fetch CSRF token
    csrf_nonce, err_msg = fetch_csrf_nonce(url, token)
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
                csrf_nonce, err_msg = fetch_csrf_nonce(url, token)
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
                # After a correct flag, force refresh the challenge list in the backend
                # (Set a flag in ctf_data to trigger refresh on next /challenges/<ctf_id> call)
                ctf_data['challenges'] = None
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
    # Only fetch if the number of solves in summary does not match the cache length
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
        api_url = f"{url}/api/v1/challenges/{chall_id}/solves"
        r = requests.get(api_url, headers=headers, timeout=60)
        if not r.ok:
            # Try to refresh token if unauthorized
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
        data = r.json()
        solves = data.get('data', [])
        # Cache the solves in ctf_data
        if 'solves' not in ctf_data:
            ctf_data['solves'] = {}
        ctf_data['solves'][cache_key] = solves
        if update_ctf_cache(ctf_id, ctf_data) == False:
            return None, 'Failed to update CTF data'
        return solves, None
    except Exception as e:
        return None, f"Exception occurred: {e}"

@app.route('/solves/<int:ctf_id>/<int:chall_id>', methods=['GET'])
def get_challenge_solves(ctf_id, chall_id):
    """Fetch and cache the list of users who solved a specific challenge from the remote CTFd server."""
    solves, err = _fetch_and_cache_challenge_solves(ctf_id, chall_id)
    if err:
        return jsonify({'error': err}), 500 if 'Exception' in err or 'Failed' in err else 404
    return jsonify({'solves': solves})

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
        # Fetch CSRF token for unlocks
        csrf_nonce, err_msg = fetch_csrf_nonce(url, token)
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
    challenges = ctf_data.get('challenges', [])
    solves_cache = ctf_data.get('solves', {})
    solved_ids = []
    for ch in challenges:
        chall_id = ch.get('id')
        solves = []
        if str(chall_id) not in solves_cache:
            continue
        # Check if user_id is in solves
        for solve in solves_cache[str(chall_id)]:
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
    webbrowser.open('http://127.0.0.1:5000', new=1)
    app.run(debug=False)
