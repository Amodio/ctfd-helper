import { LitElement, html, css } from 'lit';

export class CtfScoreboardBox extends LitElement {
  static properties = {
    ctfId:               { type: Number },
    ctfUrl:              { type: String },
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
      display: contents;
    }
    .backdrop {
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
    :host([open]) .backdrop {
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
      background: #dc3545;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 0.2em 0.5em;
      cursor: pointer;
      font-size: 1.1em;
      user-select: none;
      line-height: 1;
    }
    .close-btn:hover { background: #b52a37; }

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

    .td-pos-clean { text-align: right; width: 4em;  white-space: nowrap; }
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

    /* last-seen timestamp shown in the score cell for banned players */
    .td-last-seen { color: #8888aa; font-size: 0.80em; white-space: nowrap; }
  `;

  constructor() {
    super();
    this.ctfId                = null;
    this.ctfUrl               = '';
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
      // on scoreboard box close:
      else         { this.removeAttribute('open'); this._hideNotBanned = false; }
    }

    if (changedProps.has('ctfId') && this.ctfId !== changedProps.get('ctfId')) {
      this._error             = '';
      this._fetched           = false;
      this._scoresComputed    = false;
      this._scoreboard        = [];
      this._computedScores    = {};
      this._scoreboardFetchedAt = null;
    }

    // NO reactive fetch trigger here.
    // The only things that may call _fetchScoreboard / _computeScores are:
    //   • the 🏆 button click in ctf-challenges (handled directly in the click handler)
    //   • _refresh() — the re-fetch button inside this component
    // loadChallenges() never touches the scoreboard box so no state mutation
    // can ever trigger a spurious update.
  }

  // ── data ──────────────────────────────────────────────────────────────────

  async _fetchScoreboard(force = false, signal = null) {
    if (!this.ctfId) return;
    if (!force && (this._fetched || this._loading)) return;

    this._loading = true;
    this._error   = '';
    try {
      const url = `/scoreboard/${this.ctfId}${force ? '?refresh=1' : ''}`;
      console.log(`[DBG] Fetching scoreboard for CTF @ ${this.ctfUrl || this.ctfId}`);
      const resp = await fetch(url, signal ? { signal } : {});
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      this._scoreboard          = Array.isArray(data.data) ? data.data : [];
      this._fetched             = true;
      // Use the timestamp persisted in the JSON file so that serving from cache
      // (e.g. after a challenge-list refresh) returns the exact same value and
      // never causes "Last updated" to change unexpectedly.
      this._scoreboardFetchedAt = data.last_updated ? new Date(data.last_updated) : new Date();
      this.dispatchEvent(new CustomEvent('scoreboard-updated', {
        detail: { scoreboard: this._scoreboard },
        bubbles: true, composed: true,
      }));
    } catch (e) {
      if (e.name === 'AbortError') {
        // Cancelled intentionally (force-refresh started) — not an error.
      } else {
        this._error = `Failed to load scoreboard: ${e.message}`;
      }
    } finally {
      this._loading = false;
    }
  }

  /**
   * Called once by ctf-challenges after the initial loadChallenges() completes.
   * Pre-populates the rank chip for all players (including banned ones) without
   * waiting for the user to open the scoreboard.
   * Safe to call multiple times — the _fetched / _loading guards prevent double-fetch.
   */
  async initFetch(signal) {
    if (this._fetched || this._loading || !this.ctfId) return;
    await this._fetchScoreboard(false, signal);
    await this._computeScores();
  }

  /** Single request to the server, which aggregates all challenge solves server-side. */
  async _computeScores() {
    if (!this.ctfId || this._computing) return;
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
      this._computedAt     = Date.now();
      // Re-dispatch scoreboard-updated with pos_full so banned players get a
      // rank in ctf-challenges even though they don't appear in the raw CTFd list.
      const { rows } = this._buildRows();
      const fullScoreboard = rows
        .filter(r => !r.isHeader)
        .map(r => ({
          name:       r.name,
          account_id: r.account_id,
          pos_full:   r.pos_full ?? r.pos_clean,
          pos_clean:  r.pos_clean ?? null,
          banned:     r.banned   || false,
          last_seen:  r.last_seen || null,
        }));
      this.dispatchEvent(new CustomEvent('scoreboard-updated', {
        detail: { scoreboard: fullScoreboard },
        bubbles: true, composed: true,
      }));
    } catch (e) {
      console.error('[ctf-scoreboard-box] _computeScores failed:', e);
    } finally {
      this._computing      = false;
      this.requestUpdate();
    }
  }

  async _refresh() {
    this._scoresComputed = false;
    this._computedScores = {};
    this._computedAt     = null;
    await this._fetchScoreboard(true);
    await this._computeScores();
  }

  // ── rows ──────────────────────────────────────────────────────────────────

  _buildRows() {
    const hasComputed   = Object.keys(this._computedScores).length > 0;
    const scoreboardIds = new Set(this._scoreboard.map(s => Number(s.account_id)));

    // Banned = has computed score > 0 but entirely absent from official scoreboard
    const bannedEntries = hasComputed
      ? Object.entries(this._computedScores)
          .filter(([aid, info]) => !scoreboardIds.has(Number(aid)) && info.score > 0)
          .map(([aid, info])    => ({ account_id: Number(aid), name: info.name, computed_score: info.score, last_seen: info.last_seen || null }))
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
        last_seen:      b.last_seen || null,
      };
    });

    // Merge and sort by pos_full so banned players appear inline at their true position
    let allRows = [...normalRows, ...bannedRows]
      .sort((a, b) => (a.pos_full ?? 99999) - (b.pos_full ?? 99999));

    if (this._hideNotBanned) {
      // Group 1 — Banned: computed score > 0 but entirely absent from the official scoreboard
      const bannedGroup = bannedEntries
        .slice().sort((a, b) => b.computed_score - a.computed_score)
        .map((b, idx) => {
          const above = normalRows.filter(r => r.score > b.computed_score).length;
          return {
            account_id:     Number(b.account_id),
            name:           b.name,
            pos_clean:      null,
            score:          null,
            computed_score: b.computed_score,
            banned:         true,
            group:          'banned',
            listingRank:    null,
            pos_full:       above + idx + 1,
            last_seen:      b.last_seen || null,
          };
        });

      // Group 2 — Mismatch: in the official scoreboard but computed_score ≠ official score
      const mismatchGroup = hasComputed
        ? normalRows
            .filter(r => r.computed_score !== null && r.computed_score !== r.score)
            .slice().sort((a, b) => a.pos_clean - b.pos_clean)
            .map(r => ({ ...r, group: 'different', listingRank: null }))
        : [];

      // Assign a sequential rank across both groups combined
      let rank = 1;
      for (const r of [...bannedGroup, ...mismatchGroup]) r.listingRank = rank++;

      const rows = [
        ...(bannedGroup.length   > 0 ? [{ isHeader: true, label: `🚫 Banned (${bannedGroup.length})` },          ...bannedGroup]   : []),
        ...(mismatchGroup.length > 0 ? [{ isHeader: true, label: `⚠️ Score mismatch (${mismatchGroup.length})` }, ...mismatchGroup] : []),
      ];

      return { rows, hasComputed: true, hasBanned, monkeyMode: true, bannedCount: bannedGroup.length, mismatchCount: mismatchGroup.length };
    }

    return { rows: allRows, hasComputed, hasBanned, monkeyMode: false };
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

  /** Compact date+time string for table cells (e.g. "Jun 2, 14:35"). */
  _fmtDateShort(dateStr) {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
           + ' '
           + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  }

  _minutesAgo(date) {
    if (!date) return null;
    return Math.floor((Date.now() - date.getTime()) / 60000);
  }

  _playerHref(entry) {
    return '/?user_id=' + encodeURIComponent(entry.account_id);
  }

  // ── render ────────────────────────────────────────────────────────────────

  render() {
    // Always render — never return early — so the DOM node persists and
    // _fetched / _computedScores survive open/close cycles.
    const { rows, hasComputed, hasBanned, monkeyMode, bannedCount = 0, mismatchCount = 0 } = this._buildRows();
    const colCount = monkeyMode ? 6 : (4 + (hasComputed ? 2 : 0));

    const sbMins = this._minutesAgo(this._scoreboardFetchedAt);

    return html`
      <div class="backdrop"
        @mousedown=${e => { this._backdropMousedown = e.target === e.currentTarget; }}
        @click=${e => { if (this.open && e.target === e.currentTarget && this._backdropMousedown) this._close(); }}
      >
      <div class="box">
        <!-- header -->
        <div class="header-row">
          <h3>🏆 Scoreboard</h3>
          ${this._computing ? html`<span style="font-size:0.82em;color:#ffd700;">⚙️ computing…</span>` : ''}
          <button
            class="monkey-toggle"
            title="${this._hideNotBanned ? 'Show everyone' : 'Show players with score discrepancies'}"
            @click=${() => { this._hideNotBanned = !this._hideNotBanned; }}
          >${this._hideNotBanned ? '🙈' : '🐵'}</button>
          <button class="refresh-btn"
            title="Re-fetch scoreboard"
            @click=${() => this._refresh()}
            ?disabled=${this._loading || this._computing}
          >${this._loading ? '⏳' : '🔄'}</button>
          <button class="close-btn" @click=${() => this._close()}>&times;</button>
        </div>

        <!-- status bar: scoreboard fetch time only -->
        <div class="status-bar">
          ${this._scoreboardFetchedAt ? html`
            <span class="${sbMins < 5 ? 'ts-fresh' : 'ts-stale'}">
              Last updated: ${this._fmtTime(this._scoreboardFetchedAt)} (${sbMins}m ago)
            </span>
          ` : html`<span class="ts-never">Scoreboard not yet fetched</span>`}
        </div>

        ${this._loading ? html`<div class="loading-notice">⏳ Loading scoreboard…</div>` : ''}
        ${this._error   ? html`<div class="error">${this._error}</div>`                  : ''}

        ${!this._loading && !this._error ? html`
          <table>
            <thead>
              <tr>
                ${monkeyMode ? html`
                  <th class="td-pos-full" title="Rank within this filtered listing"># List</th>
                  <th class="td-pos-clean" title="Full rank (banned players re-inserted)"># Rank</th>
                  <th>Name</th>
                  <th style="text-align:right;" title="Official score from CTFd">Score</th>
                  <th class="td-computed" title="Computed score from cached solves">Computed</th>
                  <th class="td-status">Status</th>
                ` : html`
                  <th class="td-pos-full"
                      title="Rank if banned players were re-inserted by their computed score">
                    # Full
                  </th>
                  <th class="td-pos-clean"
                      title="Official rank — banned players already removed by CTFd">
                    # Rank
                  </th>
                  <th>Name</th>
                  <th style="text-align:right;" title="Official score from CTFd">Score</th>
                  ${hasComputed ? html`
                    <th class="td-computed"
                        title="Sum of current challenge point values for all solved challenges">
                      Computed
                    </th>
                    <th class="td-status">Status</th>
                  ` : ''}
                `}
              </tr>
            </thead>
            <tbody>
              ${rows.length === 0 ? html`
                <tr><td class="empty-msg" colspan="${colCount}">
                  ${monkeyMode
                    ? (this._computing ? 'Computing…' : 'No discrepancies detected.')
                    : 'No scoreboard data yet.'}
                </td></tr>
              ` : ''}

              ${rows.map(entry => {
                // Group header row (monkey mode only)
                if (entry.isHeader) return html`
                  <tr>
                    <td colspan="${colCount}"
                        style="padding:0.5em 0.5em 0.2em;font-size:0.82em;color:#7fffd4;
                               letter-spacing:0.05em;border-bottom:1px solid #2a4a3a;
                               background:#111;">
                      ${entry.label}
                    </td>
                  </tr>`;

                if (monkeyMode) {
                  const isBanned = entry.banned;
                  return html`
                    <tr class="${isBanned ? 'banned-row' : ''}">
                      <td class="td-pos-full">${entry.listingRank}</td>
                      <td class="td-pos-clean">${entry.pos_full ?? '—'}</td>
                      <td class="td-name">
                        <a href=${this._playerHref(entry)} target="_blank">${entry.name}</a>
                      </td>
                      <td class="td-score">
                        ${entry.banned && entry.last_seen
                          ? html`<span class="td-last-seen">${this._fmtDateShort(entry.last_seen)}</span>`
                          : entry.score !== null ? entry.score : '—'}
                      </td>
                      <td class="td-computed">${entry.computed_score !== null ? entry.computed_score : '?'}</td>
                      <td class="td-status">
                        ${isBanned
                          ? html`<span class="badge banned-badge">BANNED</span>`
                          : html`<span class="badge mismatch-badge"
                                      title="Computed score differs from official score">⚠ diff</span>`}
                      </td>
                    </tr>`;
                }

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
                    <td class="td-pos-clean">
                      ${entry.pos_clean !== null
                        ? html`${entry.pos_clean}${deltaChip}`
                        : html`<span style="color:#552233;">—</span>`}
                    </td>
                    <td class="td-name">
                      <a href=${this._playerHref(entry)} target="_blank">${entry.name}</a>
                    </td>
                    <td class="td-score">
                      ${entry.banned && entry.last_seen
                        ? html`<span class="td-last-seen">${this._fmtDateShort(entry.last_seen)}</span>`
                        : entry.score !== null ? entry.score : '—'}
                    </td>
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
      </div>
    `;
  }
}

customElements.define('ctf-scoreboard-box', CtfScoreboardBox);
