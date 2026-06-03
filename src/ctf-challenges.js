import { LitElement, html, css } from 'lit';

import './ctf-challenge.js';
import './ctf-scoreboard-box.js';
import './ctf-player-box.js';

// Module-level rank cache: ctfId -> { name -> pos, account_id_str -> pos }
// Populated passively when ctf-scoreboard-box dispatches 'scoreboard-updated'.
// Never triggers its own network request.
const _rankCache = {};
// Module-level id cache: ctfId -> { name -> account_id }
// Populated from the same scoreboard event, lets normal mode also open the player box.
const _idCache = {};
// Module-level banned cache: ctfId -> { account_id_str -> { last_seen } }
// Only contains confirmed-banned entries (ghost players detected by the scoreboard box).
const _bannedCache = {};

/** Compact date+time for inline badges (e.g. "Jun 2, 14:35"). */
function _fmtDateShort(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
         + ' '  // narrow no-break space
         + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export class CtfChallenges extends LitElement {
  static properties = {
    ctfId: { type: Number },
    ctfData: { type: Object },
    ctfUrl: { type: String },
    userId: { type: Number },
    userName: { type: String },
    open: { type: Boolean },
    login: { type: String },
    slowRefresh: { type: Number },
    showScoreboard: { type: Boolean },
    _pbOpen:        { state: true },
  };

  static styles = css`
    button[title="List of CTF"]:hover,
    button.refresh-btn:hover {
      background: #0056b3 !important;
      color: #fff !important;
    }
    .ctf-login {
      display: inline-block;
      font-size: 1.3em;
      font-weight: 900;
      background: linear-gradient(90deg, #6a8caf 0%, #b0c4de 40%, #a7c7bd 70%, #7a9e9f 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-fill-color: transparent;
      letter-spacing: 0.08em;
      border-radius: 0.4em;
      padding: 0.12em 0.45em;
      margin: 0.1em 0.2em;
      border: none;
      box-shadow: none;
      text-shadow: none;
    }
    /* clickable variant – only rendered when an account_id is resolved */
    .ctf-login[role="button"] {
      cursor: pointer;
    }
    .ctf-login[role="button"]:hover { filter: brightness(1.25); }
    .ctf-ch-row.updating {
      animation: highlight-update 0.7s linear;
      background: #2e3cff !important;
      color: #fff !important;
    }
    @keyframes highlight-update {
      0%   { background: #2e3cff; color: #fff; }
      80%  { background: #2e3cff; color: #fff; }
      100% { background: inherit; color: inherit; }
    }
    .refresh-btn {
      transition: transform 0.2s;
    }
    .refresh-btn.spinning {
      animation: spin-refresh 1s linear infinite;
    }
    @keyframes spin-refresh {
      0%   { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Wrapper */
    .challenges-wrapper {
      padding: 1em;
      background: #0008;
      min-width: 350px;
      position: relative;
    }

    /* Top toolbar */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 0.7em;
      position: relative;
      justify-content: space-between;
    }
    .toolbar-left {
      display: flex;
      align-items: center;
      gap: 0.7em;
      flex: 1 1 0;
    }
    .toolbar-center {
      flex: 2 1 0;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .toolbar-right {
      display: flex;
      align-items: center;
    }
    .back-btn {
      font-size: 1.6em;
      background: transparent;
      border: 1px #222;
      border-radius: 4px;
      cursor: pointer;
      padding: 0.1em;
    }
    .refresh-all-btn {
      font-size: 1.6em;
      border: none;
      border-radius: 4px;
      background: transparent;
      cursor: pointer;
      padding: 0.1em;
    }
    .ctf-title {
      font-size: 3em;
      font-weight: 900;
      background: linear-gradient(90deg, #00ffe7 0%, #00aaff 30%, #7d3cff 65%, #ff3c6f 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-fill-color: transparent;
      text-shadow: 0 1px 8px #00ffe755, 0 1px 0 #222, 0 0 2px #ff3c6f99;
      letter-spacing: 0.02em;
      border-radius: 0.2em;
      padding: 0.03em 0.15em;
      display: inline-block;
      text-align: center;
    }
    .hide-solved-toggle {
      font-size: 2em;
      cursor: pointer;
      user-select: none;
    }

    /* Stats row */
    .stats-row {
      margin-bottom: 0.5em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.7em;
      flex-wrap: wrap;
      text-align: center;
    }
    .stats-pct {
      font-size: 0.9em;
      color: #555;
    }
    .rank-chip {
      display: inline-block;
      background: #1a3a5c;
      color: #7fffd4;
      border: 1px solid #2a5a8c;
      border-radius: 4px;
      padding: 0.05em 0.45em;
      font-size: 0.88em;
      font-family: monospace;
      font-weight: bold;
      white-space: nowrap;
      vertical-align: middle;
    }

    /* Challenge table */
    .challenges-table-wrap {
      overflow-x: auto;
      margin-top: 1.5em;
    }
    .challenges-table {
      width: 100%;
      border-collapse: collapse;
      background: #222;
      color: #eee;
      font-family: monospace;
    }
    .challenges-table thead tr {
      background: #111;
    }
    .challenges-table th {
      padding: 0.2em 0.05em;
      border-bottom: 1px solid #333;
      color: #7fffd4;
    }
    .challenges-table td {
      padding: 0.1em 0.05em;
      border-bottom: 1px solid #333;
    }
    .cat-row td {
      padding: 0.7em;
      border-bottom: 1px solid #333;
      font-weight: bold;
      color: #00eaff;
      font-size: 1.1em;
      background: #191f1a;
    }
    .cat-stats {
      font-size: 0.9em;
      color: #aaa;
      margin-left: 1.5em;
    }
    .ctf-ch-row {
      transition: background-color 0.2s;
      cursor: pointer;
    }
    .td-status {
      /* status icon cell */
    }
    .status-solved   { color: #7fff7f; font-size: 1.5em; margin-left: 0.2em; }
    .status-unsolved { color: #ff7f7f; font-size: 1.5em; margin-left: 0.2em; }
    .td-name {
      font-weight: bold;
      color: #7fffd4;
    }
    .td-tags   { color: #aaa; text-align: center; }
    .td-points { color: #ffd700; text-align: center; }
    .td-solves { color: #b0e0e6; text-align: center; }
    .ctf-tag {
      display: inline-block;
      border-radius: 0.7em;
      padding: 0.15em 0.6em;
      margin-right: 0.3em;
      margin-bottom: 0.1em;
      font-size: 0.95em;
      font-family: monospace;
    }
    .ctf-tag[data-tag="intro"]  { background: #cfe2ff; color: #222; }
    .ctf-tag[data-tag="easy"]   { background: #7ec6b2; color: #222; }
    .ctf-tag[data-tag="medium"] { background: #ffb347; color: #222; }
    .ctf-tag[data-tag="hard"]   { background: #b52a37; color: #fff; }
    .ctf-tag[data-tag="insane"] { background: #7d3cff; color: #fff; }
    .attempts-warn { color: #ff4444; }

    /* Modal overlay */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      background: #0008;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
  `;

  constructor() {
    super();
    this._ctfId = null;
    this.ctfData = null;
    this.ctfUrl = '';
    this.userId = null;
    this.userName = '';
    this.open = false;
    this.hideSolved = localStorage.getItem('ctf-hide-solved') === '1';
    this.selectedChallenge = null;
    this.updatingChallengeId = null;
    this.isLoading = false;
    this.slowRefresh = 0;
    this.showScoreboard  = false;
    this._pbOpen         = false;
  }

  set ctfId(val) {
    const oldVal = this._ctfId;
    this._ctfId = (val !== null && val !== undefined) ? Number(val) : null;
    if (this._ctfId !== null && !isNaN(this._ctfId)) {
      localStorage.setItem('last-opened-ctf', this._ctfId);
    } else {
      localStorage.removeItem('last-opened-ctf');
    }
    if (this._ctfId !== oldVal) this.requestUpdate('ctfId', oldVal);
  }
  get ctfId() {
    return this._ctfId;
  }

  async connectedCallback() {
    super.connectedCallback();
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('user_id');
    const ctfId = localStorage.getItem('last-opened-ctf');
    if (ctfId) {
      this.ctfId = Number(ctfId);
      this.userId = userId ? Number(userId) : null;
      // User-view mode whenever a user_id is present in the URL.
      // The display name is a placeholder until the scoreboard fires
      // 'scoreboard-updated' and we can resolve the real name by account_id.
      this.hasUserName = !!userId;
      this.userName = this.hasUserName ? `User #${this.userId}` : '';
      await this.loadChallenges();
    } else {
      console.warn('[CtfChallengesAsUser] Missing ctfId or userId', { ctfId, userId });
    }
  }

  async loadChallenges(forceRefresh = false) {
    if (this.ctfId === null || this.ctfId === undefined) {
      console.warn('[CtfChallengesAsUser] loadChallenges: missing ctfId', { ctfId: this.ctfId });
      return;
    }
    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();
    const signal = this._abortController.signal;
    this.isLoading = true;
    this.requestUpdate();
    try {
      let url = `/challenges/${this.ctfId}`;
      if (forceRefresh) {
        url += '?refresh=1';
      }
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error('Failed to fetch challenges');
      const prevChallenges = (this.ctfData && this.ctfData.challenges) || [];
      this.ctfData = await response.json();

      const prevById = {};
      for (const ch of prevChallenges) prevById[ch.id] = ch;
      const reapplyTransientState = (challenges) => {
        for (const ch of challenges || []) {
          const prev = prevById[ch.id];
          if (prev) {
            if (prev.has_pending_flags) ch.has_pending_flags = prev.has_pending_flags;
            if (prev.solved_by_me === true) ch.solved_by_me = true;
          }
        }
      };
      reapplyTransientState(this.ctfData.challenges);

      const newChallenges = this.ctfData.challenges || [];
      if (this.ctfData.url) this.ctfUrl = this.ctfData.url;
      if (this.ctfData.name) this.ctfName = this.ctfData.name;
      if (!this.hasUserName && this.ctfData.login) {
        this.userName = this.ctfData.login;
      }
      if (forceRefresh) {
        this.challengeDetails = {};

        const grouped = {};
        for (const ch of newChallenges) {
          const cat = ch.category || 'Uncategorized';
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(ch);
        }
        const tagOrder = ['intro', 'easy', 'medium', 'hard', 'insane'];
        function tagRank(tags) {
          if (!tags || !tags.length) return 999;
          const tagVals = tags.map(t => (t.value || t).toLowerCase());
          for (const tag of tagOrder) {
            if (tagVals.includes(tag)) return tagOrder.indexOf(tag);
          }
          return 999;
        }
        let fetchOrder = [];
        for (const cat in grouped) {
          grouped[cat].sort((a, b) => tagRank(a.tags) - tagRank(b.tags));
          grouped[cat] = grouped[cat].map(ch => {
            if (!ch.name && ch.title) ch.name = ch.title;
            if (!ch.name) ch.name = `Challenge #${ch.id}`;
            return ch;
          });
          fetchOrder = fetchOrder.concat(grouped[cat]);
        }
        for (const ch of fetchOrder) {
          try {
            let detailUrl = `/challenge/${this.ctfId}/${ch.id}`;
            if (forceRefresh) detailUrl += '?refresh=1';
            this.updatingChallengeId = ch.id;
            this.requestUpdate();
            const resp = await fetch(detailUrl, { signal });
            if (resp.ok) {
              const details = await resp.json();
              this.challengeDetails[ch.id] = details.challenge;
              const det = this.challengeDetails[ch.id];
              if (!this.hasUserName && typeof det.solved_by_me !== 'undefined') {
                ch.solved_by_me = det.solved_by_me;
              }
              if (typeof det.attempts === 'number') ch.attempts = det.attempts;
              if (typeof det.max_attempts === 'number') ch.max_attempts = det.max_attempts;
              if (typeof det.solves === 'number') ch.solves = det.solves;
              reapplyTransientState(fetchOrder);
              this.ctfData.challenges = [...fetchOrder];
              this.requestUpdate();
            }
            await new Promise(res => setTimeout(res, 350 + (Number(this.slowRefresh) || 0)));
            if (this.updatingChallengeId === ch.id) {
              this.updatingChallengeId = null;
              this.requestUpdate();
            }
          } catch (e) {
            if (e.name === 'AbortError') return;
          }
          if (signal.aborted) return;
        }
        reapplyTransientState(fetchOrder);
        this.ctfData.challenges = [...fetchOrder];
        this.requestUpdate();
      }

      if (this.hasUserName) {
        console.log('[CtfChallengesAsUser] Fetching solved challenges for userId:', this.userId);
        const solvedResp = await fetch(`/${this.ctfId}/users/${this.userId}`);
        if (!solvedResp.ok) throw new Error('Failed to fetch user solved challenges');
        const solvedData = await solvedResp.json();
        const solvedIds = new Set(solvedData.solved_ids || []);
        if (Array.isArray(this.ctfData.challenges)) {
          for (const ch of this.ctfData.challenges) {
            ch.solved_by_me = solvedIds.has(ch.id);
          }
        }
        if (Array.isArray(this.ctfData.challenge)) {
          for (const ch of this.ctfData.challenge) {
            ch.solved_by_me = solvedIds.has(ch.id);
          }
        }
      }

      // On initial load, kick off the passive scoreboard fetch so the rank chip
      // is populated without the user having to open 🏆.
      // On force refresh we never touch the scoreboard box.
      if (!forceRefresh) {
        this.shadowRoot?.querySelector('ctf-scoreboard-box')?.initFetch();
      }

    } catch (e) {
      if (e.name === 'AbortError') return;
      this.ctfData.challenges = [];
      alert('Failed to load challenges.');
      this.requestUpdate();
    }
    this.isLoading = false;
    this.requestUpdate();
  }

  close() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this.open = false;
    this.ctfId = null;
    this.ctfData = null;
    this.ctfUrl = '';
    localStorage.removeItem('last-opened-ctf');
    this.requestUpdate();
    if (window && window.history && window.location) {
      const url = new URL(window.location.href);
      url.search = '';
      window.location.href = url.toString();
      return;
    }
    this.dispatchEvent(new CustomEvent('close-ctf-challenges', { bubbles: true, composed: true }));
    setTimeout(() => this.loadChallenges(true), 0);
  }

  openChallenge(ch) {
    document.body.style.overflow = 'hidden';
    this.selectedChallenge = { ...ch };
    this.requestUpdate();
    setTimeout(() => {
      const modal = this.shadowRoot && this.shadowRoot.querySelector('ctf-challenge');
      if (modal && typeof modal.fetchChallenge === 'function') {
        modal.fetchChallenge();
      }
    }, 0);
  }

  closeChallenge() {
    document.body.style.overflow = '';
    this.selectedChallenge = null;
    this.requestUpdate();
  }

  firstUpdated() {
    // When the challenge popup fetches fresh data (on open, force-refresh, or after
    // viewing solves), sync the updated solve count back into the list row so it
    // stays accurate without a full force-refresh of every challenge.
    this.addEventListener('challenge-updated', (e) => {
      const updated = e.detail?.challenge;
      if (!updated || !updated.id) return;
      const challenges = (this.ctfData && this.ctfData.challenges) || [];
      const ch = challenges.find(c => c.id === updated.id);
      if (ch) {
        if (typeof updated.solves       === 'number') ch.solves       = updated.solves;
        if (typeof updated.value        === 'number') ch.value        = updated.value;
        if (typeof updated.attempts     === 'number') ch.attempts     = updated.attempts;
        if (typeof updated.max_attempts === 'number') ch.max_attempts = updated.max_attempts;
        this.ctfData = { ...this.ctfData, challenges: [...challenges] };
      }
      // Crucially: also update selectedChallenge. ctf-challenges re-renders when
      // ctfData changes and passes .challenge=${this.selectedChallenge} back into
      // ctf-challenge. If selectedChallenge still has the stale count, the setter
      // overwrites ctf-challenge's freshly-updated internal state with the old value.
      if (this.selectedChallenge && String(this.selectedChallenge.id) === String(updated.id)) {
        this.selectedChallenge = {
          ...this.selectedChallenge,
          ...(typeof updated.solves       === 'number' && { solves:       updated.solves }),
          ...(typeof updated.value        === 'number' && { value:        updated.value }),
          ...(typeof updated.attempts     === 'number' && { attempts:     updated.attempts }),
          ...(typeof updated.max_attempts === 'number' && { max_attempts: updated.max_attempts }),
        };
      }
      this.requestUpdate();
    });
    this.addEventListener('challenge-solved', (e) => {
      const { challengeId } = e.detail;
      const challenges = (this.ctfData && this.ctfData.challenges) || [];
      const ch = challenges.find(c => c.id === challengeId);
      if (ch) {
        ch.solved_by_me = true;
        this.ctfData = { ...this.ctfData, challenges: [...challenges] };
      }
      this.requestUpdate();
    });
    this.addEventListener('challenge-flags-changed', (e) => {
      const { challengeId, flags } = e.detail;
      const challenges = (this.ctfData && this.ctfData.challenges) || [];
      const ch = challenges.find(c => c.id === challengeId);
      if (ch) {
        ch.has_pending_flags = flags.some(f => f.state === 'untested');
        this.ctfData = { ...this.ctfData, challenges: [...challenges] };
      }
      this.requestUpdate();
    });
    // Passively receive scoreboard data from ctf-scoreboard-box (composed event).
    // Never fetches the scoreboard independently — rank cache is populated here only.
    this.addEventListener('scoreboard-updated', (e) => {
      const scoreboard = e.detail?.scoreboard;
      if (!scoreboard || !this.ctfId) return;
      const map = {};
      const ids = {};
      for (const entry of scoreboard) {
        // Clean rank for normal players; full rank for banned players
        const rank = entry.banned
          ? (entry.pos_full ?? entry.pos)
          : (entry.pos_clean ?? entry.pos ?? entry.pos_full);
        if (entry.name)       map[entry.name]               = rank;
        if (entry.account_id) map[String(entry.account_id)] = rank;
        // store name → account_id so the player box works in normal mode too
        if (entry.name && entry.account_id) ids[entry.name] = entry.account_id;
      }
      _rankCache[this.ctfId]  = map;
      _idCache[this.ctfId]    = ids;
      // Rebuild the banned cache from this scoreboard snapshot
      const banned = {};
      for (const entry of scoreboard) {
        if (entry.banned && entry.account_id) {
          banned[String(entry.account_id)] = { last_seen: entry.last_seen || null };
        }
      }
      _bannedCache[this.ctfId] = banned;
      // In user-view mode the name was not passed through the URL — resolve it
      // from the scoreboard now that we have the full list keyed by account_id.
      if (this.hasUserName && this.userId) {
        for (const entry of scoreboard) {
          if (entry.account_id && Number(entry.account_id) === this.userId) {
            this.userName = entry.name;
            break;
          }
        }
      }
      this.requestUpdate();
    });
  }

  toggleHideSolved() {
    this.hideSolved = !this.hideSolved;
    if (this.hideSolved) {
      localStorage.setItem('ctf-hide-solved', '1');
    } else {
      localStorage.removeItem('ctf-hide-solved');
    }
    this.requestUpdate();
  }

  render() {
    const ctfData = this.ctfData || {};
    const challenges = Array.isArray(ctfData.challenges) ? ctfData.challenges : (Array.isArray(ctfData.challenge) ? ctfData.challenge : []);
    const grouped = {};
    let total = 0;
    let solved = 0;
    for (const ch of challenges) {
      const cat = ch.category || 'Uncategorized';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(ch);
      total++;
      if (ch.solved_by_me === true) solved++;
    }
    const tagOrder = ['intro', 'easy', 'medium', 'hard', 'insane'];
    const knownTags = new Set(tagOrder);
    function tagRank(tags) {
      if (!tags || !tags.length) return 999;
      const tagVals = tags.map(t => (t.value || t).toLowerCase());
      for (const tag of tagOrder) {
        if (tagVals.includes(tag)) return tagOrder.indexOf(tag);
      }
      return 999;
    }
    // Generate a stable hue from a string using a simple hash
    function tagHue(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
      }
      return hash % 360;
    }
    function tagStyle(tagVal) {
      if (knownTags.has(tagVal)) return '';
      const hue = tagHue(tagVal);
      return `background:hsl(${hue},55%,28%);color:hsl(${hue},80%,85%);`;
    }
    for (const cat in grouped) {
      grouped[cat].sort((a, b) => tagRank(a.tags) - tagRank(b.tags));
      grouped[cat] = grouped[cat].map(ch => {
        if (!ch.name && ch.title) ch.name = ch.title;
        if (!ch.name) ch.name = `Challenge #${ch.id}`;
        return ch;
      });
    }
    let displayName = this.userName;
    let ctfName = '';
    if (typeof ctfData.name === 'string' && ctfData.name) {
      ctfName = ctfData.name;
    }

    // Rank from the passively-populated cache (set when scoreboard-updated fires)
    const _cache = _rankCache[this.ctfId] || {};
    const cleanRank = _cache[displayName]
      ?? (this.userId != null ? _cache[String(this.userId)] : undefined)
      ?? null;

    // Points summary
    let solvedPoints = 0;
    let totalPoints = 0;
    for (const ch of challenges) {
      const val = Number(ch.value) || 0;
      totalPoints += val;
      if (ch.solved_by_me === true) solvedPoints += val;
    }

    // Resolve the account_id for the player-box:
    // • user mode  → this.userId is set directly from props
    // • normal mode → look up the login name in the scoreboard id-cache
    //   (populated passively once ctf-scoreboard-box fires 'scoreboard-updated')
    const pbUserId = this.userId
      || (_idCache[this.ctfId] && displayName && _idCache[this.ctfId][displayName])
      || null;

    // Check whether the viewed player is banned (must come after pbUserId)
    const _bCache        = _bannedCache[this.ctfId] || {};
    const _bannedEntry   = pbUserId ? _bCache[String(pbUserId)] : null;
    const isBannedPlayer = !!_bannedEntry;

    return html`
      <div class="challenges-wrapper">
        <div class="toolbar">
          <div class="toolbar-left">
            <button title="List of CTF" class="back-btn" @click=${() => this.close()}>🔙</button>
            <button
              title="${this.isLoading ? 'Stop refresh' : 'Refresh all challenges'}"
              class="refresh-btn${this.isLoading ? ' spinning' : ''} refresh-all-btn"
              @click=${() => {
                if (this.isLoading && this._abortController) {
                  this._abortController.abort();
                  this.isLoading = false;
                  this.requestUpdate();
                } else {
                  this.loadChallenges(true);
                }
              }}
            >🔄</button>
            <button
              title="Scoreboard"
              class="refresh-all-btn"
              style="font-size:1.6em;background:transparent;border:none;cursor:pointer;padding:0.1em;"
              @click=${async () => {
                this.showScoreboard = true;
                this.requestUpdate();
                const sb = this.shadowRoot?.querySelector('ctf-scoreboard-box');
                if (!sb) return;
                // Fetch raw scoreboard if we don't have it yet.
                if (!sb._fetched && !sb._loading) await sb._fetchScoreboard();
                // Always recompute on open so ranks are fresh after a challenge refresh.
                // _computeScores() is a no-op when already computing.
                await sb._computeScores();
              }}
            >🏆</button>
          </div>
          <div class="toolbar-center">
            ${ctfName ? html`<span class="ctf-title">${ctfName}</span>` : ''}
          </div>
          <div class="toolbar-right">
            <span
              @click=${() => {
                this.toggleHideSolved();
                setTimeout(() => {
                  const el = this.shadowRoot && this.shadowRoot.querySelector('.hide-solved-toggle');
                  if (el) el.title = this.hideSolved ? 'Show all challenges' : 'Hide solved challenges';
                }, 0);
              }}
              class="hide-solved-toggle"
              title="${this.hideSolved ? 'Show all challenges' : 'Hide solved challenges'}"
            >${this.hideSolved ? '🙈' : '🐵'}</span>
          </div>
        </div>

        <h2 class="stats-row">
          ${displayName ? html`
            <span
              class="ctf-login"
              role=${pbUserId ? 'button' : 'text'}
              @click=${pbUserId ? () => { this._pbOpen = true; } : null}
            >${displayName}</span>
          ` : ''}
          ${isBannedPlayer
            ? html`<span class="rank-chip"
                         style="background:#2a1020;border-color:#7a1030;color:#ffb0b8;">${cleanRank !== null ? html`#${cleanRank}` : ''}</span>`
            : cleanRank !== null ? html`<span class="rank-chip">#${cleanRank}</span>` : ''}
          <span class="stats-pct">
            ${solved}/${total} solved (${total > 0 ? Math.round((solved/total)*100) : 0}%)
            | ${solvedPoints}/${totalPoints} pts
          </span>
        </h2>

        <div class="challenges-table-wrap">
          <table class="challenges-table">
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th style="text-align:center;">Tags</th>
                <th style="text-align:center;">Points</th>
                <th style="text-align:center;">Solves</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(grouped).map(([cat, chs]) => {
                const visibleChs = chs.filter(ch => !this.hideSolved || ch.solved_by_me !== true);
                if (visibleChs.length === 0) return '';
                const catSolved = chs.filter(ch => ch.solved_by_me === true).length;
                const catTotal = chs.length;
                const catPct = catTotal > 0 ? Math.round((catSolved/catTotal)*100) : 0;
                return html`
                  <tr class="cat-row">
                    <td colspan="5">
                      ${cat}
                      <span class="cat-stats">${catSolved}/${catTotal} solved (${catPct}%)</span>
                    </td>
                  </tr>
                  ${visibleChs.map(ch => {
                    const isLocked = typeof ch.max_attempts === 'number' && ch.max_attempts > 0 && typeof ch.attempts === 'number' && ch.attempts >= ch.max_attempts && ch.solved_by_me !== true;
                    let baseBg = '#222';
                    let baseColor = '#e0ffe0';
                    let hoverBg = '#295c29';
                    let hoverColor = '#b6ffb6';
                    if (ch.solved_by_me) {
                      baseBg = '#1a3a1a';
                      baseColor = '#7fff7f';
                      hoverBg = '#2e5c2e';
                      hoverColor = '#b6ffb6';
                    }
                    if (isLocked) {
                      baseBg = '#222';
                      baseColor = '#aaa';
                      hoverBg = '#222';
                      hoverColor = '#aaa';
                    }
                    const name = ch.name || ch.title || `Challenge #${ch.id}`;
                    const attempts = typeof ch.attempts === 'number' && !this.hasUserName ? ch.attempts : null;
                    const maxAttempts = typeof ch.max_attempts === 'number' ? ch.max_attempts : null;
                    let attemptsSpan = '';
                    if (this.hasUserName && typeof ch.max_attempts === 'number' && ch.max_attempts > 0) {
                      attemptsSpan = html`<span class="attempts-warn">&nbsp;&nbsp;(max attempts: ${maxAttempts})</span>`;
                    }
                    if (attempts !== null && maxAttempts !== null && maxAttempts > 0) {
                      attemptsSpan = html`<span class="attempts-warn">&nbsp;&nbsp;(attempts: ${attempts}/${maxAttempts})</span>`;
                    }
                    const nameWithAttempts = html`${name}${attemptsSpan}`;
                    const nameCell = (maxAttempts !== null && maxAttempts > 0 && attempts === maxAttempts)
                      ? html`<del>${nameWithAttempts}</del>`
                      : nameWithAttempts;
                    const tagsCell = ch.tags && ch.tags.length
                      ? ch.tags.map(t => {
                          const tv = (t.value || t).toLowerCase();
                          const style = tagStyle(tv);
                          return html`<span class="ctf-tag" data-tag="${tv}" style="${style}">${t.value || t}</span>`;
                        })
                      : '';
                    return html`
                      <tr class="ctf-ch-row ${ch.solved_by_me ? 'solved' : 'unsolved'}${this.updatingChallengeId === ch.id ? ' updating' : ''}"
                        style="background-color:${baseBg}; color:${baseColor}; opacity:${isLocked ? 0.5 : 1};"
                        @click=${() => { this.openChallenge(ch); }}
                        @mouseover=${function(e){
                          if (!isLocked) {
                            e.currentTarget.style.backgroundColor = hoverBg;
                            e.currentTarget.style.color = hoverColor;
                          }
                        }}
                        @mouseout=${function(e){
                          e.currentTarget.style.backgroundColor = baseBg;
                          e.currentTarget.style.color = baseColor;
                        }}
                      >
                        <td class="td-status">
                          ${ch.solved_by_me === true
                            ? html`<span class="status-solved">✔</span>`
                            : (ch.has_pending_flags && !this.hasUserName)
                              ? html`<span title="You have a flag to submit">❔</span>`
                              : html`<span class="status-unsolved">✗</span>`}
                        </td>
                        <td class="td-name">${nameCell}</td>
                        <td class="td-tags">${isLocked ? html`<del>${tagsCell}</del>` : tagsCell}</td>
                        <td class="td-points">${isLocked ? html`<del>${ch.value || ''}</del>` : (ch.value || '')}</td>
                        <td class="td-solves">${isLocked ? html`<del>${typeof ch.solves === 'number' ? ch.solves : ''}</del>` : (typeof ch.solves === 'number' ? ch.solves : '')}</td>
                      </tr>
                    `;
                  })}
                `;
              })}
            </tbody>
          </table>
        </div>

        ${Object.keys(grouped).length === 0 ? html`<p>No challenges yet, please wait a few seconds...</p>` : ''}

        ${this.selectedChallenge ? html`
          <div class="modal-overlay"
            @mousedown=${e => { this._overlayMousedownTarget = e.target; }}
            @click=${e => { if (e.target === e.currentTarget && this._overlayMousedownTarget === e.currentTarget) this.closeChallenge(); }}
            @refresh-challenges=${() => { document.body.style.overflow = ''; this.selectedChallenge = null; this.loadChallenges(true); this.requestUpdate(); }}>
            <ctf-challenge
              .ctfId=${this.ctfId}
              .ctfUrl=${this.ctfUrl}
              .challenge=${this.selectedChallenge}
              .open=${true}
              .viewOnly=${!!this.hasUserName}
              style="max-height:90vh;overflow-y:auto;"
              @close-ctf-challenge=${this.closeChallenge.bind(this)}
            ></ctf-challenge>
          </div>
        ` : ''}

        <ctf-scoreboard-box
          .ctfId=${this.ctfId}
          .ctfUrl=${this.ctfUrl || ''}
          .open=${this.showScoreboard}
          @close-scoreboard=${() => { this.showScoreboard = false; this.requestUpdate(); }}
        ></ctf-scoreboard-box>

        <ctf-player-box
          .ctfId=${this.ctfId}
          .userId=${pbUserId}
          .userName=${displayName || `User #${pbUserId}`}
          .rank=${cleanRank}
          .open=${this._pbOpen}
          @close-player-box=${() => { this._pbOpen = false; }}
        ></ctf-player-box>
      </div>
    `;
  }
}

customElements.define('ctf-challenges', CtfChallenges);
