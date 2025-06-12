import { LitElement, html, css } from 'lit';

export class CtfSolvesBox extends LitElement {
  static properties = {
    ctfId: { type: Number },
    challengeId: { type: Number },
    open: { type: Boolean },
    solves: { type: Array },
    loading: { type: Boolean },
    error: { type: String },
  };

  static styles = css`
    :host {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.45);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .box {
      background: #181c1f;
      color: #e0ffe0;
      border-radius: 8px;
      box-shadow: 0 2px 16px #000a;
      padding: 2em 2.5em;
      min-width: 320px;
      max-width: 90vw;
      max-height: 80vh;
      overflow-y: auto;
      font-family: monospace, system-ui, sans-serif;
      position: relative;
    }
    h3 {
      margin-top: 0;
      color: #b0e0e6;
      font-size: 1.3em;
    }
    .close-btn {
      position: absolute;
      top: 0.7em;
      right: 1em;
      background: #dc3545;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 0.2em 0.5em;
      cursor: pointer;
      font-size: 1.1em;
    }
    .close-btn:hover {
      background: #b52a37;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0.5em 0 0 0;
    }
    li {
      padding: 0.3em 0.5em;
      border-bottom: 1px solid #333;
      color: #e0ffe0;
      font-size: 1em;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .solve-user {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .solve-date {
      color: #ffd700;
      font-size: 0.95em;
      margin-left: 0.7em;
      flex: 0 0 auto;
      text-align: right;
      white-space: nowrap;
    }
    .loading, .error {
      margin: 1em 0;
      color: #ffd700;
      text-align: center;
    }
    .error {
      color: #b52a37;
    }
  `;

  constructor() {
    super();
    this.ctfId = null;
    this.challengeId = null;
    this.open = false;
    this.solves = [];
    this.loading = false;
    this.error = '';
  }

  updated(changedProps) {
    if (
      ((changedProps.has('ctfId') || changedProps.has('challengeId')) && this.open) ||
      (changedProps.has('open') && this.open)
    ) {
      this.fetchSolves();
    }
  }

  async fetchSolves() {
    if (!this.challengeId) return;
    this.loading = true;
    this.error = '';
    this.solves = [];
    try {
      const resp = await fetch(`/solves/${this.ctfId}/${this.challengeId}`);
      if (!resp.ok) throw new Error('Failed to fetch solves');
      const data = await resp.json();
      this.solves = Array.isArray(data.solves) ? data.solves : [];
    } catch (e) {
      this.error = 'Failed to load solves.';
    } finally {
      this.loading = false;
    }
  }

  close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close-solves-box', { bubbles: true, composed: true }));
  }

  render() {
    if (!this.open) return html``;
    return html`
      <div class="box">
        <button class="close-btn" @click=${() => this.close()}>&times;</button>
        <h3>Solves</h3>
        ${this.loading ? html`<div class="loading">Loading...</div>` : ''}
        ${this.error ? html`<div class="error">${this.error}</div>` : ''}
        <ul>
          ${this.solves.length === 0 && !this.loading && !this.error ? html`<li>No solves yet.</li>` : ''}
          ${this.solves.map(solve => html`
            <li>
              <span class="solve-user">
                <a href="/?username=${solve.name}&user_id=${solve.account_id}" target="_blank" style="color:#00eaff;text-decoration:underline;">
                  ${solve.name}
                </a>
              </span>
              <span class="solve-date">${solve.date ? (new Date(solve.date)).toLocaleString() : ''}</span>
            </li>
          `)}
        </ul>
      </div>
    `;
  }
}

customElements.define('ctf-solves-box', CtfSolvesBox);
