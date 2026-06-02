import { LitElement, html, css } from 'lit';

// Colour palette – picked to pop on dark backgrounds, ordered by visual distinctiveness
const PALETTE = [
  '#00eaff', '#ffd700', '#a29bfe', '#55efc4', '#fd79a8',
  '#fdcb6e', '#74b9ff', '#e17055', '#6c5ce7', '#00b894',
  '#e84393', '#2ecc71', '#e74c3c', '#f39c12', '#1abc9c',
];

function catColor(idx) {
  return PALETTE[idx % PALETTE.length];
}

export class CtfPlayerBox extends LitElement {
  static properties = {
    ctfId:      { type: Number },
    userId:     { type: Number },
    userName:   { type: String },
    open:       { type: Boolean, reflect: true },
    _solves:    { state: true },
    _loading:   { state: true },
    _error:     { state: true },
    _banned:    { state: true },
    _lastSeen:  { state: true },
    rank:       { type: Number },
  };

  static styles = css`
    :host { display: contents; }

    /* ── Backdrop ─────────────────────────────────────────────────────── */
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.68);
      z-index: 30000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* ── Box ──────────────────────────────────────────────────────────── */
    .box {
      background: #111619;
      color: #e0ffe0;
      border-radius: 10px;
      border: 1px solid #1e3030;
      box-shadow: 0 6px 50px #000d, 0 0 0 1px #1e3030;
      width: min(840px, 96vw);
      max-height: 92vh;
      overflow-y: auto;
      font-family: monospace, system-ui, sans-serif;
      padding: 1.4em 1.8em 2em;
      animation: pb-in 0.16s cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes pb-in {
      from { opacity: 0; transform: scale(0.93) translateY(-10px); }
      to   { opacity: 1; transform: scale(1)    translateY(0);     }
    }

    /* ── Header ───────────────────────────────────────────────────────── */
    .header {
      display: flex;
      align-items: center;
      gap: 0.6em;
      padding-bottom: 0.85em;
      margin-bottom: 0.9em;
      border-bottom: 1px solid #1a2e2a;
      flex-wrap: wrap;
    }
    .player-icon { font-size: 1.7em; line-height: 1; }
    .player-name {
      margin: 0;
      flex: 1 1 0;
      min-width: 0;
      font-family: monospace;
      font-size: 1.45em;
      font-weight: 900;
      background: linear-gradient(90deg, #7fffd4 0%, #00eaff 55%, #a29bfe 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chips { display: flex; gap: 0.4em; flex-wrap: wrap; }
    .chip {
      background: #1a3a5c;
      color: #b0e0e6;
      border: 1px solid #2a5a8c;
      border-radius: 4px;
      padding: 0.1em 0.55em;
      font-size: 0.84em;
      font-family: monospace;
      white-space: nowrap;
    }
    .chip.pts      { background: #2a2510; color: #ffd700; border-color: #5a4500; }
    .chip.banned   { background: #2a1020; color: #ffb0b8; border-color: #7a2040; }
    .chip.last-seen { background: #1a1a2a; color: #8888bb; border-color: #3a3a5a; font-size:0.80em; }
    .chip.rank      { background: #1a2a1a; color: #90ee90; border-color: #2a5a2a; }
    .close-btn {
      background: #dc3545;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 0.2em 0.6em;
      cursor: pointer;
      font-size: 1.2em;
      flex-shrink: 0;
      line-height: 1.1;
    }
    .close-btn:hover { background: #b52a37; }

    /* ── Section title ────────────────────────────────────────────────── */
    .section-title {
      color: #00eaff;
      font-size: 0.78em;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.13em;
      margin: 1.1em 0 0.45em;
      padding-bottom: 0.25em;
      border-bottom: 1px solid #172522;
    }
    .section-title span {
      color: #7fffd4;
      font-weight: normal;
      text-transform: none;
      letter-spacing: 0;
      font-size: 1.15em;
    }

    /* ── Score chart ──────────────────────────────────────────────────── */
    .chart-wrap {
      background: #0b1214;
      border-radius: 6px;
      border: 1px solid #172522;
      padding: 0.5em 0.3em 0.3em 0.3em;
    }
    .no-chart {
      color: #4a7a6a;
      font-size: 0.88em;
      text-align: center;
      padding: 1.4em;
    }

    /* ── Pie charts row ───────────────────────────────────────────────── */
    .pies-row {
      display: flex;
      gap: 0.8em;
      flex-wrap: wrap;
      margin-bottom: 0.2em;
    }
    .pie-wrap {
      flex: 1 1 280px;
      background: #0b1214;
      border: 1px solid #172522;
      border-radius: 6px;
      padding: 0.65em 0.8em 0.8em;
    }
    .pie-subtitle {
      color: #7fffd4;
      font-size: 0.8em;
      font-weight: bold;
      text-align: center;
      margin-bottom: 0.5em;
      letter-spacing: 0.05em;
    }
    .pie-inner {
      display: flex;
      align-items: center;
      gap: 0.7em;
    }
    .pie-legend-list {
      flex: 1 1 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.22em;
      max-height: 155px;
      overflow-y: auto;
    }
    .pie-legend-row {
      display: flex;
      align-items: center;
      gap: 0.35em;
      font-size: 0.8em;
      line-height: 1.3;
    }
    .pie-dot {
      display: inline-block;
      width: 0.65em;
      height: 0.65em;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .pie-cat  { color: #b0e0e6; flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pie-num  { color: #7fffd4; flex-shrink: 0; font-weight: bold; }
    .pie-pct  { color: #4a7a6a; flex-shrink: 0; }

    /* ── Solve table ──────────────────────────────────────────────────── */
    .table-wrap {
      overflow-x: auto;
      max-height: 270px;
      overflow-y: auto;
      border-radius: 5px;
      border: 1px solid #172522;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88em;
    }
    thead tr {
      background: #090c0e;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    th {
      padding: 0.42em 0.75em;
      border-bottom: 1px solid #1e3030;
      color: #7fffd4;
      text-align: left;
      white-space: nowrap;
      font-size: 0.9em;
    }
    td { padding: 0.28em 0.75em; border-bottom: 1px solid #10191a; }
    tbody tr:hover td { background: #141e20; }
    .td-n { color: #7fffd4; font-weight: bold; }
    .td-c { color: #00eaff; }
    .td-p { color: #ffd700; text-align: right; white-space: nowrap; }
    .td-d { color: #5a8a7a; font-size: 0.87em; white-space: nowrap; }

    /* ── States ───────────────────────────────────────────────────────── */
    .loading, .error, .empty {
      text-align: center;
      padding: 2.5em;
      font-family: monospace;
      font-size: 0.95em;
    }
    .loading { color: #ffd700; }
    .error   { color: #e05060; }
    .empty   { color: #4a7a6a; }
  `;

  constructor() {
    super();
    this.ctfId    = null;
    this.userId   = null;
    this.userName = '';
    this.open      = false;
    this._solves   = [];
    this._loading  = false;
    this._error    = '';
    this._banned   = false;
    this._lastSeen = null;
    this.rank      = null;
  }

  updated(changedProps) {
    const openChanged  = changedProps.has('open');
    const idChanged    = changedProps.has('userId') || changedProps.has('ctfId');
    if (openChanged) {
      if (this.open) this.setAttribute('open', '');
      else           this.removeAttribute('open');
    }
    if ((openChanged && this.open) || (idChanged && this.open)) {
      this._fetchData();
    }
  }

  async _fetchData() {
    if (this.ctfId == null || this.userId == null) return;
    this._loading = true;
    this._error   = '';
    this._solves  = [];
    try {
      const r = await fetch(`/player/${this.ctfId}/${this.userId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      this._solves   = Array.isArray(data.solves) ? data.solves : [];
      this._banned   = data.banned   || false;
      this._lastSeen = data.last_seen || null;
    } catch (e) {
      this._error = `Could not load player profile: ${e.message}`;
    } finally {
      this._loading = false;
    }
  }

  _close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close-player-box', { bubbles: true, composed: true }));
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  _timeline() {
    const withDates = this._solves
      .map(s => ({ ...s, _d: s.date ? new Date(s.date) : null }))
      .filter(s => s._d && !isNaN(s._d.getTime()));
    withDates.sort((a, b) => a._d - b._d);
    let cum = 0;
    return withDates.map(s => ({ ...s, cumScore: (cum += Number(s.value) || 0) }));
  }

  _catData() {
    const map = {};
    for (const s of this._solves) {
      const cat = s.category || 'Uncategorized';
      if (!map[cat]) map[cat] = { count: 0, points: 0 };
      map[cat].count++;
      map[cat].points += Number(s.value) || 0;
    }
    return Object.keys(map)
      .sort((a, b) => map[b].points - map[a].points)
      .map((cat, i) => ({
        label:  cat,
        count:  map[cat].count,
        points: map[cat].points,
        color:  catColor(i),
      }));
  }

  // ── Score chart ───────────────────────────────────────────────────────────

  _renderChart() {
    const tl = this._timeline();
    if (!tl.length) return html`<div class="no-chart">No dated solve data available for the timeline.</div>`;

    const W = 560, H = 185;
    const ml = 50, mr = 14, mt = 12, mb = 38;
    const pw = W - ml - mr;
    const ph = H - mt - mb;

    const maxScore = tl[tl.length - 1].cumScore;
    if (!maxScore) return html`<div class="no-chart">Total score is 0 — no chart to show.</div>`;

    const minT   = tl[0]._d.getTime();
    const maxT   = tl[tl.length - 1]._d.getTime();
    const tRange = maxT - minT || 3_600_000; // at least 1 h so a single solve renders fine

    const toX = t => ml + ((t - minT) / tRange) * pw;
    const toY = s => mt + ph - (s / maxScore) * ph;

    // Step-function polyline: horizontal until a solve, then vertical jump
    let linePath = `M ${ml.toFixed(1)} ${toY(0).toFixed(1)}`;
    for (const p of tl) {
      linePath += ` H ${toX(p._d.getTime()).toFixed(1)} V ${toY(p.cumScore).toFixed(1)}`;
    }
    linePath += ` H ${(ml + pw).toFixed(1)}`;

    const areaPath = `${linePath} V ${toY(0).toFixed(1)} H ${ml.toFixed(1)} Z`;

    // Dots (solve events)
    const dots = tl.map(p => ({
      cx:  toX(p._d.getTime()).toFixed(1),
      cy:  toY(p.cumScore).toFixed(1),
      tip: `${p.name}\n+${p.value} pts  →  ${p.cumScore} total\n${p._d.toLocaleString()}`,
    }));

    // Y-axis ticks (5 steps from 0 to maxScore)
    const Y_STEPS = 5;
    const yTicks = Array.from({ length: Y_STEPS + 1 }, (_, i) => {
      const score = Math.round((maxScore / Y_STEPS) * i);
      return { y: toY(score).toFixed(1), label: i === 0 ? '' : (score >= 1000 ? `${(score / 1000).toFixed(1)}k` : score) };
    });

    // X-axis ticks (up to 6)
    const xCount = Math.min(6, tl.length + 1);
    const xTicks = Array.from({ length: xCount }, (_, i) => {
      const t = minT + (i / Math.max(xCount - 1, 1)) * tRange;
      return {
        x:     toX(t).toFixed(1),
        label: new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      };
    });

    return html`
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;" aria-label="Score over time">
        <defs>
          <linearGradient id="pb-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#00eaff" stop-opacity="0.20"/>
            <stop offset="100%" stop-color="#00eaff" stop-opacity="0.01"/>
          </linearGradient>
        </defs>

        <!-- horizontal grid lines -->
        ${yTicks.map(t => html`
          <line x1="${ml}" y1="${t.y}" x2="${ml + pw}" y2="${t.y}"
                stroke="#182824" stroke-width="1" stroke-dasharray="4 3"/>
        `)}

        <!-- area fill -->
        <path d="${areaPath}" fill="url(#pb-area-grad)"/>

        <!-- step line -->
        <path d="${linePath}" fill="none" stroke="#00eaff" stroke-width="2.5" stroke-linecap="square"/>

        <!-- solve dots -->
        ${dots.map(p => html`
          <circle cx="${p.cx}" cy="${p.cy}" r="4.5" fill="#00eaff" stroke="#111619" stroke-width="2">
            <title>${p.tip}</title>
          </circle>
        `)}

        <!-- Y axis -->
        <line x1="${ml}" y1="${mt}" x2="${ml}" y2="${mt + ph}" stroke="#253530" stroke-width="1.5"/>
        ${yTicks.map(t => html`
          <text x="${ml - 5}" y="${(Number(t.y) + 4).toFixed(1)}" text-anchor="end"
                font-family="monospace" font-size="10" fill="#4a7a6a">${t.label}</text>
        `)}

        <!-- X axis -->
        <line x1="${ml}" y1="${mt + ph}" x2="${ml + pw}" y2="${mt + ph}" stroke="#253530" stroke-width="1.5"/>
        ${xTicks.map(t => html`
          <text x="${t.x}" y="${(mt + ph + 16).toFixed(1)}" text-anchor="middle"
                font-family="monospace" font-size="10" fill="#4a7a6a">${t.label}</text>
        `)}

        <!-- axis label -->
        <text transform="translate(12,${(mt + ph / 2).toFixed(1)}) rotate(-90)"
              text-anchor="middle" font-family="monospace" font-size="10" fill="#37574f">Score</text>
      </svg>
    `;
  }

  // ── Donut pie chart ───────────────────────────────────────────────────────

  _renderPie(catData, key, subtitle) {
    const items = catData.filter(c => c[key] > 0);
    const total = items.reduce((s, c) => s + c[key], 0);
    if (!total || !items.length) return html``;

    const R = 70, r = 40, cx = 88, cy = 82, W = 176, H = 164;

    let slices;

    if (items.length === 1) {
      // Full circle: SVG arc can't express 360° in one command, use two semicircles
      const col = items[0].color;
      const tip = `${items[0].label}: ${items[0][key]} (100%)`;
      slices = html`
        <path d="M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx} ${cy + R} A ${R} ${R} 0 1 1 ${cx} ${cy - R} Z"
              fill="${col}" stroke="#111619" stroke-width="1.5" opacity="0.9"><title>${tip}</title></path>
        <path d="M ${cx} ${cy - r} A ${r} ${r} 0 1 0 ${cx} ${cy + r} A ${r} ${r} 0 1 0 ${cx} ${cy - r} Z"
              fill="#111619" stroke="none"/>
      `;
    } else {
      let a = -Math.PI / 2;
      slices = items.map(cat => {
        const ang = (cat[key] / total) * 2 * Math.PI;
        if (ang < 0.005) return '';
        const a1 = a, a2 = a + ang;
        a = a2;
        const la = ang > Math.PI ? 1 : 0;
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        const c2 = Math.cos(a2), s2 = Math.sin(a2);
        const pathD = [
          `M ${(cx + R * c1).toFixed(2)} ${(cy + R * s1).toFixed(2)}`,
          `A ${R} ${R} 0 ${la} 1 ${(cx + R * c2).toFixed(2)} ${(cy + R * s2).toFixed(2)}`,
          `L ${(cx + r * c2).toFixed(2)} ${(cy + r * s2).toFixed(2)}`,
          `A ${r} ${r} 0 ${la} 0 ${(cx + r * c1).toFixed(2)} ${(cy + r * s1).toFixed(2)}`,
          'Z',
        ].join(' ');
        const pct = Math.round((cat[key] / total) * 100);
        return html`
          <path d="${pathD}" fill="${cat.color}" stroke="#111619" stroke-width="1.5" opacity="0.9">
            <title>${cat.label}: ${cat[key]} (${pct}%)</title>
          </path>`;
      });
    }

    const centerNum = key === 'count' ? total : total;
    const centerSub = key === 'count' ? 'solves' : 'pts';

    return html`
      <div class="pie-wrap">
        <div class="pie-subtitle">${subtitle}</div>
        <div class="pie-inner">
          <svg viewBox="0 0 ${W} ${H}" style="width:${W}px;height:${H}px;flex-shrink:0;">
            ${slices}
            <!-- centre label -->
            <text x="${cx}" y="${cy - 6}" text-anchor="middle"
                  font-family="monospace" font-size="15" font-weight="bold" fill="#7fffd4">${centerNum}</text>
            <text x="${cx}" y="${cy + 10}" text-anchor="middle"
                  font-family="monospace" font-size="9" fill="#4a7a6a">${centerSub}</text>
          </svg>
          <div class="pie-legend-list">
            ${items.map(cat => {
              const pct = Math.round((cat[key] / total) * 100);
              return html`
                <div class="pie-legend-row">
                  <span class="pie-dot" style="background:${cat.color}"></span>
                  <span class="pie-cat">${cat.label}</span>
                  <span class="pie-num">${cat[key]}</span>
                  <span class="pie-pct">&thinsp;${pct}%</span>
                </div>`;
            })}
          </div>
        </div>
      </div>
    `;
  }

  // ── render ────────────────────────────────────────────────────────────────

  render() {
    if (!this.open) return html``;

    const catData  = this._catData();
    const sorted   = [...this._solves].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da; // newest first
    });
    const totalPts = this._solves.reduce((s, p) => s + (Number(p.value) || 0), 0);

    return html`
      <div class="backdrop"
        @mousedown=${e => { this._bdDown = e.target === e.currentTarget; }}
        @click=${e => { if (e.target === e.currentTarget && this._bdDown) this._close(); }}>

        <div class="box">

          <!-- Header -->
          <div class="header">
            <span class="player-icon">${this._banned ? '🚫' : '🧑‍💻'}</span>
            <h2 class="player-name">${this.userName || `User #${this.userId}`}</h2>
            <div class="chips">
              ${this.rank != null ? html`<span class="chip rank">#${this.rank}</span>` : ''}
              ${this._banned ? html`
                <span class="chip banned">BANNED</span>
                ${this._lastSeen ? html`
                  <span class="chip last-seen"
                        title="Last confirmed active: ${new Date(this._lastSeen).toLocaleString()}">
                    last seen ${new Date(this._lastSeen).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    ${new Date(this._lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ` : ''}
              ` : ''}
              <span class="chip">${this._solves.length} solved</span>
              <span class="chip pts">${totalPts} pts</span>
            </div>
            <button class="close-btn" @click=${() => this._close()}>&times;</button>
          </div>

          ${this._loading ? html`<div class="loading">⏳ Loading player profile…</div>` : ''}
          ${this._error   ? html`<div class="error">${this._error}</div>`               : ''}

          ${!this._loading && !this._error && this._solves.length === 0 ? html`
            <div class="empty">
              No cached solve data for this player yet.<br>
              Try refreshing the challenge list first (🔄).
            </div>
          ` : ''}

          ${!this._loading && !this._error && this._solves.length > 0 ? html`
            <!-- Solved challenges -->
            <div class="section-title">Solved challenges</div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Challenge</th>
                    <th>Category</th>
                    <th style="text-align:right;">Pts</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${sorted.map(s => html`
                    <tr>
                      <td class="td-n">${s.name}</td>
                      <td class="td-c">${s.category || '—'}</td>
                      <td class="td-p">${s.value ?? '—'}</td>
                      <td class="td-d">${s.date ? new Date(s.date).toLocaleString() : '—'}</td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>

            <!-- Score over time -->
            <div class="section-title">Score over time</div>
            <div class="chart-wrap">${this._renderChart()}</div>

            <!-- Category breakdown -->
            <div class="section-title">Category breakdown</div>
            <div class="pies-row">
              ${this._renderPie(catData, 'count',  'Solves per category')}
              ${this._renderPie(catData, 'points', 'Points per category')}
            </div>
          ` : ''}

        </div>
      </div>
    `;
  }
}

customElements.define('ctf-player-box', CtfPlayerBox);
