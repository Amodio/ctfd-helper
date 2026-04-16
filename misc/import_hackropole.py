#!/usr/bin/env python3
"""
import_hackropole.py — Import Hackropole CTF challenges into a local CTFd instance.

Usage:
    python import_hackropole.py [options]

Options:
    --host HOST          CTFd host (default: localhost)
    --port PORT          CTFd port (default: 8000)
    --username USER      CTFd admin username (default: admin)
    --password PASS      CTFd admin password (default: password)
    --year YEAR          Filter challenges by year (e.g. 2025)
    --category CAT       Filter challenges by category (e.g. crypto)
    --lang LANG          Language for descriptions: en or fr (default: en)
    --dir DIR            Path to hackropole directory (default: ./hackropole)
    --verbose            Print detailed HTTP activity
    -y / --yes           Skip confirmation prompt
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Optional

import requests


# ─────────────────────────────────────────────────────────────────────────────
# ANSI colours (degrade gracefully if not a tty)
# ─────────────────────────────────────────────────────────────────────────────

def _c(code: str, text: str) -> str:
    if sys.stdout.isatty():
        return f"\033[{code}m{text}\033[0m"
    return text

GREEN  = lambda t: _c("32", t)
YELLOW = lambda t: _c("33", t)
RED    = lambda t: _c("31", t)
CYAN   = lambda t: _c("36", t)
BOLD   = lambda t: _c("1",  t)
DIM    = lambda t: _c("2",  t)

# Set to True by --verbose
VERBOSE = False

def vlog(msg: str) -> None:
    if VERBOSE:
        print(DIM(f"  [v] {msg}"))


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

DIFFICULTY_MAP = {0: 1, 1: 25, 2: 50, 3: 100, 4: 200, 5: 500}

def difficulty_to_value(d: Optional[int]) -> int:
    return DIFFICULTY_MAP.get(d, 100)

def difficulty_label(d: Optional[int]) -> str:
    return {0: "intro", 1: "easy", 2: "medium", 3: "hard", 4: "expert", 5: "insane"}.get(d, "unknown")


# ─────────────────────────────────────────────────────────────────────────────
# Local challenge scanning
# ─────────────────────────────────────────────────────────────────────────────

def scan_local(base_dir: str, year: Optional[int], category: Optional[str]) -> list[dict]:
    """
    Walk the hackropole directory tree and return a list of challenge dicts,
    each augmented with _slug, _category, and _dir fields.
    """
    base = Path(base_dir)
    if not base.is_dir():
        print(RED(f"[!] Directory not found: {base_dir}"))
        sys.exit(1)

    challenges = []
    for cat_dir in sorted(base.iterdir()):
        if not cat_dir.is_dir():
            continue
        cat_name = cat_dir.name
        if category and cat_name.lower() != category.lower():
            continue
        for chall_dir in sorted(cat_dir.iterdir()):
            if not chall_dir.is_dir():
                continue
            details_path = chall_dir / "details.json"
            if not details_path.exists():
                continue
            try:
                data = json.loads(details_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as e:
                print(YELLOW(f"[!] Skipping {chall_dir.name}: invalid JSON ({e})"))
                continue
            if year and data.get("year") != year:
                continue
            data["_slug"]     = chall_dir.name
            data["_category"] = cat_name
            data["_dir"]      = str(chall_dir)
            challenges.append(data)

    return challenges


# ─────────────────────────────────────────────────────────────────────────────
# CTFd API client
# ─────────────────────────────────────────────────────────────────────────────

class CTFdClient:
    def __init__(self, host: str, port: int, username: str, password: str):
        self.base = f"http://{host}:{port}"
        self.session = requests.Session()
        self._login(username, password)

    # ── authentication ────────────────────────────────────────────────────────

    def _login(self, username: str, password: str) -> None:
        vlog(f"GET {self.base}/login")
        r = self.session.get(f"{self.base}/login", timeout=10)
        r.raise_for_status()
        self.csrfNonce = self._extract_form_nonce(r.text)
        vlog(f"Extracted form nonce: {self.csrfNonce}")

        vlog(f"POST {self.base}/login  (user={username})")
        r = self.session.post(
            f"{self.base}/login",
            data={"name": username, "password": password, "nonce": self.csrfNonce},
            allow_redirects=True,
            timeout=10,
        )
        r.raise_for_status()
        vlog(f"Login redirect → {r.url}  status={r.status_code}")
        if "incorrect" in r.text.lower() or r.url.rstrip("/").endswith("/login"):
            print(RED("[!] Login failed — check your credentials."))
            sys.exit(1)

        vlog(f"GET {self.base}/admin/challenges  (extracting csrfNonce)")
        r = self.session.get(f"{self.base}/admin/challenges", timeout=10)
        r.raise_for_status()
        self.csrfNonce = self._extract_form_nonce(r.text)
        self.session.headers.update({"CSRF-Token": self.csrfNonce})
        vlog(f"CSRF-Token set to: {self.csrfNonce}")

    @staticmethod
    def _extract_form_nonce(html: str) -> str:
        m = re.search(r"'csrfNonce':\s*\"([a-f0-9]+)\"", html)
        if not m:
            print(RED("[!] Could not find CSRF token."))
            sys.exit(1)
        return m.group(1)

    # ── generic helpers ───────────────────────────────────────────────────────

    def get(self, path: str, **kwargs):
        vlog(f"GET {path}")
        r = self.session.get(f"{self.base}{path}", timeout=15, **kwargs)
        vlog(f"  → {r.status_code}")
        r.raise_for_status()
        return r.json()

    def post(self, path: str, **kwargs):
        vlog(f"POST {path}  payload={kwargs.get('json') or kwargs.get('data')}")
        r = self.session.post(f"{self.base}{path}", timeout=30, **kwargs)
        vlog(f"  → {r.status_code}  body={r.text[:200]}")
        r.raise_for_status()
        return r.json()

    # ── challenge operations ──────────────────────────────────────────────────

    def fetch_existing_challenges(self) -> dict[str, dict]:
        """Return {name: challenge_object} for all challenges currently on CTFd."""
        resp = self.get("/api/v1/challenges?per_page=500")
        return {c["name"]: c for c in resp.get("data", [])}

    def create_challenge(self, payload: dict) -> int:
        resp = self.post("/api/v1/challenges", json=payload)
        return resp["data"]["id"]

    def set_tags(self, chall_id: int, tags: list[str]) -> None:
        for tag in tags:
            self.post("/api/v1/tags", json={"challenge": chall_id, "value": tag})

    def set_flag(self, chall_id: int, placeholder: str, case_insensitive: bool) -> None:
        self.post("/api/v1/flags", json={
            "content": placeholder,
            "data": "case_insensitive" if case_insensitive else "",
            "type": "sha256",
            "challenge": chall_id,
        })

    def upload_file(self, chall_id: int, file_path: str, file_name: str) -> None:
        with open(file_path, "rb") as fh:
            self.session.post(
                f"{self.base}/api/v1/files",
                data={"challenge": chall_id, "type": "challenge", "nonce": self.csrfNonce},
                files={"file": (file_name, fh)},
                timeout=60,
            ).raise_for_status()


# ─────────────────────────────────────────────────────────────────────────────
# Import logic
# ─────────────────────────────────────────────────────────────────────────────

def import_challenge(client: CTFdClient, chall: dict, existing_names: set[str], lang: str) -> str:
    """Returns 'added' or 'skipped'."""
    title = chall.get("title", chall["_slug"])

    if title in existing_names:
        return "skipped"

    payload = {
        "name":        chall.get("title", chall["_slug"]),
        "category":    chall["_category"],
        "description": "\n".join([chall.get(f"description_{lang}").strip(),
                                chall.get(f"instructions_{lang}").strip()]),
        "value":       difficulty_to_value(chall.get("difficulty")),
        "state":       "visible",
        "type":        "standard",
    }
    chall_id = client.create_challenge(payload)

    client.set_tags(chall_id, chall.get("tags"))
    client.set_flag(chall_id, chall.get("flag_infos").get("hash"),
                    chall.get("flag_infos").get("case_insensitive"))

    files_dir = Path(chall["_dir"]) / "files"
    if files_dir.is_dir():
        for f in sorted(files_dir.iterdir()):
            if f.is_file():
                try:
                    client.upload_file(chall_id, str(f), f.name)
                except Exception as e:
                    print(YELLOW(f"    [!] Could not upload {f.name}: {e}"))

    return "added"


# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

def print_summary(challenges: list[dict], existing_names: set[str]) -> tuple[list, list]:
    to_add  = []
    to_skip = []

    for c in challenges:
        title = c.get("title", c["_slug"])
        if title in existing_names:
            to_skip.append(c)
        else:
            to_add.append(c)

    print()
    print(BOLD("━" * 60))
    print(BOLD("  Hackropole → CTFd Import Summary"))
    print(BOLD("━" * 60))
    print(f"  Local challenges found: {BOLD(str(len(challenges)))}")
    print(f"  {GREEN('To add')}                : {GREEN(str(len(to_add)))}")
    print(f"  {DIM('To skip (exists)')}      : {DIM(str(len(to_skip)))}")
    print(BOLD("━" * 60))

    by_cat: dict[str, dict[str, list]] = defaultdict(lambda: {"add": [], "skip": []})
    for c in to_add:  by_cat[c["_category"]]["add"].append(c)
    for c in to_skip: by_cat[c["_category"]]["skip"].append(c)

    if by_cat:
        print(f"\n  {'Category':<20} {'Add':>5} {'Skip':>6}")
        print(f"  {'─'*20} {'─'*5} {'─'*6}")
        for cat in sorted(by_cat):
            a = len(by_cat[cat]["add"])
            s = len(by_cat[cat]["skip"])
            print(f"  {CYAN(cat):<29} {GREEN(str(a)):>14} {DIM(str(s)):>14}")
        print()

    return to_add, to_skip


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Import Hackropole challenges into a CTFd instance.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--host",     default="localhost", help="CTFd host (default: localhost)")
    p.add_argument("--port",     type=int, default=8000, help="CTFd port (default: 8000)")
    p.add_argument("--username", default="admin",    help="CTFd admin username (default: admin)")
    p.add_argument("--password", default="password", help="CTFd admin password (default: password)")
    p.add_argument("--year",     type=int,           help="Filter by year (e.g. 2025)")
    p.add_argument("--category",                     help="Filter by category (e.g. crypto)")
    p.add_argument("--lang",     default="en", choices=["en", "fr"],
                   help="Language for descriptions (default: en)")
    p.add_argument("--dir",      default="./hackropole",
                   help="Path to hackropole directory (default: ./hackropole/)")
    p.add_argument("--verbose", "-v",  action="store_true",
                   help="Print detailed HTTP activity")
    p.add_argument("--yes", "-y", action="store_true",
                   help="Skip confirmation prompt")
    return p.parse_args()


def confirm(prompt: str) -> bool:
    try:
        ans = input(prompt).strip().lower()
    except (EOFError, KeyboardInterrupt):
        return False
    return ans in ("y", "yes", "")


def main() -> None:
    args = parse_args()

    global VERBOSE
    VERBOSE = args.verbose

    print(BOLD("\n🏴 Hackropole → CTFd Importer"))
    print(DIM(f"   Target : http://{args.host}:{args.port}"))
    print(DIM(f"   Source : {args.dir}  |  Lang: {args.lang}") +
          (DIM(f"  |  Year: {args.year}") if args.year else "") +
          (DIM(f"  |  Category: {args.category}") if args.category else ""))
    print()

    # 1. Scan local challenges
    print(DIM("  Scanning local directory…"))
    challenges = scan_local(args.dir, args.year, args.category)
    if not challenges:
        print(YELLOW("  No challenges match the given filters. Nothing to do."))
        sys.exit(0)

    # 2. Connect to CTFd and fetch existing challenges
    print(DIM("  Connecting to CTFd…"))
    try:
        client = CTFdClient(args.host, args.port, args.username, args.password)
    except requests.exceptions.ConnectionError:
        print(RED(f"[!] Cannot connect to CTFd at http://{args.host}:{args.port}"))
        sys.exit(1)
    except requests.exceptions.HTTPError as e:
        print(RED(f"[!] HTTP error: {e}"))
        sys.exit(1)

    existing_map   = client.fetch_existing_challenges()
    existing_names = set(existing_map.keys())
    print(DIM(f"  CTFd has {len(existing_names)} existing challenge(s)."))

    # 3. Summary + confirmation
    to_add, to_skip = print_summary(challenges, existing_names)

    if not to_add:
        print(DIM("  Nothing to import (all challenges already exist)."))
        sys.exit(0)

    if not args.yes:
        proceed = confirm(BOLD(f"  Proceed? [{len(to_add)} challenge(s) will be added] [Y/n] "))
        if not proceed:
            print(DIM("  Aborted."))
            sys.exit(0)

    # 4. Import
    print()
    added = skipped = errors = 0

    for chall in challenges:
        title = chall.get("title", chall["_slug"])
        label = f"[{chall['_category']}/{chall.get('year', '')}] {title} ({difficulty_label(chall.get('difficulty'))})"

        try:
            result = import_challenge(client, chall, existing_names, args.lang)
        except Exception as e:
            print(f"  {RED('✗')} {label}")
            print(f"      {RED(str(e))}")
            errors += 1
            continue

        if result == "added":
            print(f"  {GREEN('✓')} {label}")
            added += 1
        else:
            print(f"  {DIM('–')} {label} {DIM('(skipped)')}")
            skipped += 1

    # 5. Final report
    print()
    print(BOLD("━" * 60))
    print(f"  {GREEN('Added')}   : {GREEN(str(added))}")
    print(f"  {DIM('Skipped')} : {DIM(str(skipped))}")
    if errors:
        print(f"  {RED('Errors')}  : {RED(str(errors))}")
    print(BOLD("━" * 60))
    print()


if __name__ == "__main__":
    main()