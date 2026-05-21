import { LitElement, html, css } from 'lit';

// Module-level cache: survives ctf-scoreboard-box destruction/recreation.
// ctfId -> { scoreboard: [...], fetchedAt: Date }
const _cache = {};

export class CtfScoreboardBox extends LitElement {
  static properties = {
    ctfId:               { type: Number },
    open:                { type: Boolean },
    // internal reactive state
    _scoreboard:         { state: true },   // raw API array
    _computedScores:     { state: true },   // account_id (number) -> { name, score }
    _loading:            { state: true },
    _computing:          { state: true },
    _error:              { state: true },
    _fetched:            { state: true },   // true after first scoreboard fetch for this ctfId
    _scoresComputed:     { state: true },   // true after first score computation for this ctfId
    _scoreboardFetchedAt:{ state: true },   // Date | null — shown in status bar
    _hideNotBanned:      { state: true },   // monkey toggle: show only banned rows
  };

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      /* invisible when closed — pointer-events off so it doesn't block the page */
      background: rgba(0,0,0,0);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      transition: background 0.15s;
    }
    :host([open]) {
      background: rgba(0,0,0,0.55);
      pointer-events: auto;
    }
    .box {
      background: #181c1f;
      color: #e0ffe0;
      border-radius: 8px;
      box-shadow: 0 2px 24px #000c;
      padding: 1.4em 1.8em 1.6em;
      min-width: 440px;
      max-width: 94vw;
      max-height: 88vh;
      overflow-y: auto;
      font-family: monospace, system-ui, sans-serif;
      /* hidden via scale/opacity so the DOM node always exists (preserves state) */
      transform: scale(0.92);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.12s, opacity 0.12s;
    }
    :host([open]) .box {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }

    /* ── header ──────────────────────────────────────── */
    .header-row {
      display: flex;
      align-items: center;
      gap: 0.6em;
      margin-bottom: 0.2em;
    }
    h3 {
      margin: 0;
      color: #b0e0e6;
      font-size: 1.22em;
      flex: 1 1 auto;
      white-space: nowrap;
    }
    .monkey-toggle {
      font-size: 1.35em;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 0 0.05em;
      line-height: 1;
      user-select: none;
      title: attr(title);
    }
    .monkey-toggle:hover { opacity: 0.72; }
    .refresh-btn {
      font-size: 1.5em;
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      padding: 0.05em 0.1em;
      line-height: 1;
      user-select: none;
      transition: opacity 0.15s;
    }
    .refresh-btn:hover:not(:disabled) { opacity: 0.7; }
    .refresh-btn:disabled { opacity: 0.3; cursor: default; }
    .close-btn {
      font-size: 1.5em;
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      padding: 0.05em 0.15em;
      line-height: 1;
      color: #e05060;
      user-select: none;
      transition: opacity 0.15s;
    }
    .close-btn:hover { opacity: 0.7; }

    /* ── status bar ──────────────────────────────────── */
    .status-bar {
      font-size: 0.76em;
      color: #556;
      margin-bottom: 0.5em;
      display: flex;
      gap: 1.2em;
      flex-wrap: wrap;
      align-items: center;
    }
    .ts-fresh { color: #4a8; }
    .ts-stale { color: #a74; }
    .ts-never { color: #555; font-style: italic; }

    .computing-notice {
      margin: 0.5em 0;
      color: #ffd700;
      font-size: 0.88em;
    }
    .loading-notice {
      margin: 0.7em 0;
      color: #ffd700;
      text-align: center;
      font-size: 0.92em;
    }
    .error {
      margin: 0.7em 0;
      color: #e05060;
      text-align: center;
    }

    /* ── table ───────────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.94em;
      margin-top: 0.35em;
    }
    thead tr { background: #111; }
    th {
      padding: 0.35em 0.5em;
      color: #7fffd4;
      border-bottom: 1px solid #2a2a2a;
      text-align: left;
      white-space: nowrap;
    }
    td {
      padding: 0.27em 0.5em;
      border-bottom: 1px solid #1d2121;
      vertical-align: middle;
    }
    tbody tr:hover td    { background: #1e2b27; }
    .banned-row td       { background: #251015 !important; }
    .banned-row:hover td { background: #331520 !important; }

    .td-pos-clean { color: #5a7a6a; text-align: right; width: 4em;  white-space: nowrap; }
    .td-pos-full  { color: #9090d0; text-align: right; width: 3em;  white-space: nowrap; font-weight: bold; }
    .td-name      { min-width: 9em; }
    .td-name a    { color: #00eaff; text-decoration: underline; }
    .td-name a:hover { color: #66ffff; }
    .td-score     { color: #ffd700; text-align: right; width: 5.5em; }
    .td-computed  { color: #9ab4e0; text-align: right; width: 5.5em; font-size: 0.88em; }
    .td-status    { text-align: center; width: 5em; }

    .rank-delta        { font-size: 0.78em; margin-left: 0.22em; }
    .rank-delta.worse  { color: #d04050; }
    .rank-delta.better { color: #40c070; }

    .badge {
      display: inline-block;
      border-radius: 0.4em;
      padding: 0.07em 0.4em;
      font-size: 0.79em;
      font-weight: bold;
      white-space: nowrap;
    }
    .banned-badge   { background: #6a0e1c; color: #ffb0b8; }
    .ok-badge       { background: #163316; color: #7fff7f; }
    .mismatch-badge { background: #2e2500; color: #ffd060; cursor: help; }

    .empty-msg { color: #555; text-align: center; padding: 1.2em 0; }
  `;

  constructor() {
    super();
    this.ctfId                = null;
    this.open                 = false;
    this._scoreboard          = [];
    this._computedScores      = {};
    this._loading             = false;
    this._computing           = false;
    this._error               = '';
    this._fetched             = false;
    this._scoresComputed      = false;
    this._scoreboardFetchedAt = null;
    this._hideNotBanned       = false;
  }

  // Reflect `open` to an attribute so the :host([open]) CSS selector works
  updated(changedProps) {
    if (changedProps.has('open')) {
      if (this.open) this.setAttribute('open', '');
      else           this.removeAttribute('open');
    }

    // When CTF changes, wipe cached state and immediately fetch the scoreboard
    // so the rank chip in ctf-challenges is populated without needing to open the panel.
    if (changedProps.has('ctfId') && this.ctfId !== changedProps.get('ctfId')) {
      this._fetched             = false;
      this._scoresComputed      = false;
      this._scoreboard          = [];
      this._computedScores      = {};
      this._scoreboardFetchedAt = null;
      this._error               = '';
      this._fetchScoreboard();
    }

    // On first open: compute scores (scoreboard already fetched eagerly above).
    if (changedProps.has('open') && this.open) {
      if (!this._fetched)        this._fetchScoreboard();   // fallback if ctfId was already set
      if (!this._scoresComputed) this._computeScores();
    }
  }

  // ── data ──────────────────────────────────────────────────────────────────

  async _fetchScoreboard() {
    if (!this.ctfId) return;

    // 1. In-memory cache (survives component recreation within the same JS context)
    if (_cache[this.ctfId]) {
      this._scoreboard          = _cache[this.ctfId].scoreboard;
      this._fetched             = true;
      this._scoreboardFetchedAt = _cache[this.ctfId].fetchedAt;
      this.dispatchEvent(new CustomEvent('scoreboard-updated', {
        detail: { scoreboard: this._scoreboard },
        bubbles: true, composed: true,
      }));
      return;
    }

    // 2. sessionStorage cache (survives page reloads within the browser tab session)
    try {
      const stored = sessionStorage.getItem(`scoreboard_${this.ctfId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        _cache[this.ctfId] = { scoreboard: parsed.scoreboard, fetchedAt: new Date(parsed.fetchedAt) };
        this._scoreboard          = _cache[this.ctfId].scoreboard;
        this._fetched             = true;
        this._scoreboardFetchedAt = _cache[this.ctfId].fetchedAt;
        this.dispatchEvent(new CustomEvent('scoreboard-updated', {
          detail: { scoreboard: this._scoreboard },
          bubbles: true, composed: true,
        }));
        return;
      }
    } catch {}

    // 3. Network fetch — only when both caches miss
    this._loading = true;
    this._error   = '';
    try {
      const resp = await fetch(`/scoreboard/${this.ctfId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      this._scoreboard          = Array.isArray(data.data) ? data.data : [];
      this._fetched             = true;
      this._scoreboardFetchedAt = new Date();
      _cache[this.ctfId] = { scoreboard: this._scoreboard, fetchedAt: this._scoreboardFetchedAt };
      try {
        sessionStorage.setItem(`scoreboard_${this.ctfId}`, JSON.stringify({
          scoreboard: this._scoreboard,
          fetchedAt:  this._scoreboardFetchedAt.toISOString(),
        }));
      } catch {}
      this.dispatchEvent(new CustomEvent('scoreboard-updated', {
        detail: { scoreboard: this._scoreboard },
        bubbles: true, composed: true,
      }));
    } catch (e) {
      this._error = `Failed to load scoreboard: ${e.message}`;
    } finally {
      this._loading = false;
    }
  }

  /** Single request to the server, which aggregates all challenge solves server-side. */
  async _computeScores() {
    if (!this.ctfId) return;
    this._computing = true;
    try {
      const resp = await fetch(`/computed_scores/${this.ctfId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      // Server returns { scores: { "account_id": { name, score } } }
      // Merge with existing so previously-detected banned players aren't dropped
      // if the server temporarily returns fewer results.
      const incoming = data.scores ?? {};
      const merged   = { ...this._computedScores };
      for (const [aid, info] of Object.entries(incoming)) {
        merged[Number(aid)] = info;
      }
      this._computedScores = merged;
      this._scoresComputed = true;
    } catch (e) {
      console.error('[ctf-scoreboard-box] _computeScores failed:', e);
    } finally {
      this._computing      = false;
      this.requestUpdate();
    }
  }

  async _refresh() {
    // Clear both cache layers so _fetchScoreboard goes to the server.
    delete _cache[this.ctfId];
    try { sessionStorage.removeItem(`scoreboard_${this.ctfId}`); } catch {}
    await this._fetchScoreboard();
  }

  // ── rows ──────────────────────────────────────────────────────────────────

  _buildRows() {
    const hasComputed   = Object.keys(this._computedScores).length > 0;
    const scoreboardIds = new Set(this._scoreboard.map(s => Number(s.account_id)));

    // Banned = has computed score > 0 but entirely absent from official scoreboard
    const bannedEntries = hasComputed
      ? Object.entries(this._computedScores)
          .filter(([aid, info]) => !scoreboardIds.has(Number(aid)) && info.score > 0)
          .map(([aid, info])    => ({ account_id: Number(aid), name: info.name, computed_score: info.score }))
          .sort((a, b) => b.computed_score - a.computed_score)
      : [];

    const hasBanned = bannedEntries.length > 0;

    // Official scoreboard rows
    const normalRows = this._scoreboard.map(s => ({
      account_id:     Number(s.account_id),
      name:           s.name,
      pos_clean:      s.pos,     // rank in the already-sanitised (post-ban) scoreboard
      score:          s.score,
      computed_score: this._computedScores[Number(s.account_id)]?.score ?? null,
      banned:         false,
      pos_full:       s.pos,     // default: same as clean; overridden below when we have bans
    }));

    // pos_full for non-banned = official_pos + count(banned with computed_score > official_score)
    // pos_full for banned     = count(non-banned with score > computed) + rank-among-banned + 1
    if (hasBanned) {
      for (const row of normalRows) {
        const above = bannedEntries.filter(b => b.computed_score > row.score).length;
        row.pos_full = row.pos_clean + above;
      }
    }

    const bannedRows = bannedEntries.map((b, idx) => {
      const above = normalRows.filter(r => r.score > b.computed_score).length;
      return {
        account_id:     b.account_id,
        name:           b.name,
        pos_clean:      null,
        score:          null,
        computed_score: b.computed_score,
        banned:         true,
        pos_full:       above + idx + 1,
      };
    });

    // Merge and sort by pos_full so banned players appear inline at their true position
    let allRows = [...normalRows, ...bannedRows]
      .sort((a, b) => (a.pos_full ?? 99999) - (b.pos_full ?? 99999));

    if (this._hideNotBanned) {
      allRows = bannedRows.sort((a, b) => a.pos_full - b.pos_full);
    }

    return { rows: allRows, hasComputed, hasBanned };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  _close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close-scoreboard', { bubbles: true, composed: true }));
  }

  _fmtTime(date) {
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
         + ' '
         + date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  _minutesAgo(date) {
    if (!date) return null;
    return Math.floor((Date.now() - date.getTime()) / 60000);
  }

  _playerHref(entry) {
    return '/?user_id='  + encodeURIComponent(entry.account_id)
         + '&username=' + encodeURIComponent(entry.name ?? '');
  }

  // ── render ────────────────────────────────────────────────────────────────

  render() {
    // Always render — never return early — so the DOM node persists and
    // _fetched / _computedScores survive open/close cycles.
    const { rows, hasComputed, hasBanned } = this._buildRows();
    const colCount = (this._hideNotBanned ? 2 : 4) + (hasComputed ? 2 : 0);

    const sbMins = this._minutesAgo(this._scoreboardFetchedAt);

    return html`
      <div class="box">
        <!-- header -->
        <div class="header-row">
          <h3>🏆 Scoreboard</h3>
          ${this._computing ? html`<span style="font-size:0.82em;color:#ffd700;">⚙️ computing…</span>` : ''}
          <button
            class="monkey-toggle"
            title="${this._hideNotBanned ? 'Show everyone' : 'Show only banned players'}"
            @click=${() => { this._hideNotBanned = !this._hideNotBanned; }}
          >${this._hideNotBanned ? '🙈' : '🐵'}</button>
          <button class="refresh-btn"
            title="Re-fetch scoreboard"
            @click=${() => this._refresh()}
            ?disabled=${this._loading || this._computing}
          >${this._loading ? '⏳' : '🔄'}</button>
          <button class="close-btn" title="Close" @click=${() => this._close()}>✕</button>
        </div>

        <!-- status bar: scoreboard fetch time only -->
        <div class="status-bar">
          ${this._scoreboardFetchedAt ? html`
            <span class="${sbMins < 5 ? 'ts-fresh' : 'ts-stale'}">
              Scoreboard fetched: ${this._fmtTime(this._scoreboardFetchedAt)} (${sbMins}m ago)
            </span>
          ` : html`<span class="ts-never">Scoreboard not yet fetched</span>`}
        </div>

        ${this._loading ? html`<div class="loading-notice">⏳ Loading scoreboard…</div>` : ''}
        ${this._error   ? html`<div class="error">${this._error}</div>`                  : ''}

        ${!this._loading && !this._error ? html`
          <table>
            <thead>
              <tr>
                <th class="td-pos-full"
                    title="Rank if banned players were re-inserted by their computed score">
                  # full
                </th>
                ${!this._hideNotBanned ? html`
                  <th class="td-pos-clean"
                      title="Official rank — banned players already removed by CTFd">
                    # clean
                  </th>
                ` : ''}
                <th>Name</th>
                ${!this._hideNotBanned ? html`
                  <th style="text-align:right;" title="Official score from CTFd">Score</th>
                ` : ''}
                ${hasComputed ? html`
                  <th class="td-computed"
                      title="Sum of current challenge point values for all solved challenges">
                    Computed
                  </th>
                  <th class="td-status">Status</th>
                ` : ''}
              </tr>
            </thead>
            <tbody>
              ${rows.length === 0 ? html`
                <tr><td class="empty-msg" colspan="${colCount}">
                  ${this._hideNotBanned
                    ? (this._computing ? 'Computing…' : 'No banned players detected.')
                    : 'No scoreboard data yet.'}
                </td></tr>
              ` : ''}

              ${rows.map(entry => {
                const scoreMismatch = hasComputed
                  && !entry.banned
                  && entry.computed_score !== null
                  && entry.computed_score !== entry.score;

                // Delta chip: how many positions worse with banned players re-inserted
                let deltaChip = '';
                if (hasBanned && !entry.banned) {
                  const delta = entry.pos_full - entry.pos_clean;
                  if      (delta > 0) deltaChip = html`<span class="rank-delta worse">▼${delta}</span>`;
                  else if (delta < 0) deltaChip = html`<span class="rank-delta better">▲${Math.abs(delta)}</span>`;
                }

                return html`
                  <tr class="${entry.banned ? 'banned-row' : ''}">

                    <td class="td-pos-full">
                      ${entry.pos_full !== null ? html`${entry.pos_full}` : '🚫'}
                    </td>

                    ${!this._hideNotBanned ? html`
                      <td class="td-pos-clean">
                        ${entry.pos_clean !== null
                          ? html`${entry.pos_clean}${deltaChip}`
                          : html`<span style="color:#552233;">—</span>`}
                      </td>
                    ` : ''}

                    <td class="td-name">
                      <a href=${this._playerHref(entry)} target="_blank">
                        ${entry.name}
                      </a>
                    </td>

                    ${!this._hideNotBanned ? html`
                      <td class="td-score">
                        ${entry.score !== null ? entry.score : '—'}
                      </td>
                    ` : ''}

                    ${hasComputed ? html`
                      <td class="td-computed">
                        ${entry.computed_score !== null ? entry.computed_score : '?'}
                      </td>
                      <td class="td-status">
                        ${entry.banned
                          ? html`<span class="badge banned-badge">BANNED</span>`
                          : scoreMismatch
                            ? html`<span class="badge mismatch-badge"
                                        title="Score mismatch — normal for dynamic scoring">⚠ diff</span>`
                            : html`<span class="badge ok-badge">✓</span>`}
                      </td>
                    ` : ''}
                  </tr>
                `;
              })}
            </tbody>
          </table>
        ` : ''}
      </div>
    `;
  }
}

customElements.define('ctf-scoreboard-box', CtfScoreboardBox);
