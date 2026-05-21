import { LitElement, html, css } from 'lit';
import { marked } from 'marked';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import './ctf-solves-box.js';
import './ctf-magic-box.js';

export class CtfChallenge extends LitElement {
  static properties = {
    ctfId: { type: Number },
    ctfUrl: { type: String },
    challenge: { type: Object },
    open: { type: Boolean },
    loading: { type: Boolean },
    error: { type: String },
    flagDraft: { type: String },
    showSolvesBox: { type: Boolean },
    _solvesBoxChallengeId: { type: Number },
    _solvesBoxCtfId: { type: Number },
    flags: { type: Array },
    showMagic: { type: Boolean },
    viewOnly: { type: Boolean },
  };

  static styles = css`
    :host {
      display: block;
      background: #101615 !important;
      color: #e0ffe0;
      border: 1px solid #333;
      border-radius: 8px;
      box-shadow: 0 2px 8px #0003;
      padding: 1.5em;
      margin: 1em auto;
      max-width: 1024px;
      font-family: monospace, system-ui, sans-serif;
    }
    h2 {
      margin-top: 0;
      color: #7fffd4;
      font-family: monospace;
    }
    .close-btn {
      background: #dc3545;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 0em 0.3em;
      cursor: pointer;
      font-size: 0.9em;
    }
    .close-btn:hover {
      background: #b52a37;
    }
    .refresh-btn {
      font-size: 0.9em;
      border: none;
      border-radius: 4px;
      background: rgb(16, 22, 21);
      padding: 0.1em;
      cursor: pointer;
    }
    .refresh-btn:hover {
      background: #0056b3;
    }
    .meta {
      color: #b0e0e6;
      font-size: 0.98em;
      margin-bottom: 0.5em;
    }
    .desc {
      margin: 1em 0;
    }
    .tags {
      color: #aaa;
      font-size: 0.95em;
      margin-top: 0.5em;
    }
    .loading {
      color: #888;
      font-style: italic;
      margin: 1em 0;
    }
    .error {
      color: #b52a37;
      margin: 1em 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #222;
      color: #eee;
      font-family: monospace;
    }
    th, td {
      padding: 0.5em 0.7em;
      border-bottom: 1px solid #333;
    }
    th {
      background: #111;
      color: #7fffd4;
    }
    tr {
      transition: background 0.2s;
    }
    tr:hover {
      background: #26332e;
    }
    .ctf-tag[data-tag="intro"] {
      background: #cfe2ff;
      color: #222;
    }
    .ctf-tag[data-tag="easy"] {
      background: #7ec6b2;
      color: #222;
    }
    .ctf-tag[data-tag="medium"] {
      background: #ffb347;
      color: #222;
    }
    .ctf-tag[data-tag="hard"] {
      background: #b52a37;
      color: #fff;
    }
    .ctf-tag[data-tag="insane"] {
      background: #7d3cff;
      color: #fff;
    }
    .ctf-tag {
      display: inline-block;
      border-radius: 0.7em;
      padding: 0.15em 0.6em;
      margin-right: 0.3em;
      margin-bottom: 0.1em;
      font-size: 0.95em;
      font-family: monospace;
    }
    .magic-btn {
      background: #494355;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 0.1em 0.2em;
      font-size: 0.8em;
      cursor: pointer;
      box-shadow: 0 2px 8px #0003;
      transition: background 0.18s, box-shadow 0.18s;
    }
    .magic-btn:hover {
      background: #7d3cff;
      color: #fff;
      box-shadow: 0 4px 16px #7d3cff55;
    }
    /* Magic overlay */
    .magic-overlay {
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      z-index: 9999;
      background: #101615;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: stretch;
      margin: 0; padding: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .magic-overlay-close {
      position: absolute;
      top: 1.2em; right: 1.7em;
      z-index: 10001;
      background: #dc3545;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 0em 0.3em;
      font-size: 1.3em;
      cursor: pointer;
      box-shadow: 0 2px 8px #0003;
    }
    .magic-overlay-inner {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100vw;
      height: 100vh;
    }
    /* h2 header row */
    .challenge-header {
      display: flex;
      align-items: center;
      gap: 0.5em;
    }
    .challenge-title {
      flex: 1;
    }
    .challenge-attribution {
      font-size: 0.7em;
      color: #888;
      font-weight: normal;
      margin-left: 0.7em;
    }
    /* meta row */
    .meta-category {
      color: #00eaff;
    }
    .meta-points {
      margin-left: 1em;
      color: #ffd700;
    }
    .meta-solves {
      margin-left: 1em;
      color: #b0e0e6;
      cursor: pointer;
    }
    .meta-attempts {
      margin-left: 1em;
      color: #b52a37;
    }
    .meta-tags {
      margin-left: 1em;
    }
    /* connection info */
    .connection-info {
      margin: 0.5em 0;
      padding: 0.5em;
      background: #181c1f;
      border-left: 4px solid #007bff;
      color: #e0ffe0;
      font-family: monospace;
      white-space: pre-line;
    }
    /* hints */
    .hints-block {
      margin: 0.2em 0 0.7em 0;
      text-align: center;
      color: #ffb347;
      font-weight: bold;
      font-size: 1.08em;
    }
    .hints-list {
      list-style: none;
      padding: 0;
      margin: 0.5em 0 0 0;
      text-align: left;
      display: inline-block;
    }
    .hints-list li {
      margin-bottom: 0.5em;
    }
    .hint-content {
      color: #ffd700;
      margin-left: 0.7em;
    }
    .hint-loading {
      color: #888;
    }
    .hint-error {
      color: #b52a37;
      margin-left: 0.7em;
      font-size: 0.98em;
      display: inline;
    }
    /* files */
    .files-block {
      margin: 0.5em 0;
    }
    .files-list {
      margin: 0.2em 0 0 1.2em;
      padding: 0;
      list-style: none;
    }
    .files-list li {
      display: inline-block;
      margin-right: 0.5em;
      margin-bottom: 0.3em;
    }
    .file-link {
      display: inline-flex;
      align-items: center;
      gap: 0.4em;
      padding: 0.35em 0.9em 0.35em 0.7em;
      background: #222;
      border: 1px solid #17a2b8;
      border-radius: 0.5em;
      color: #00eaff;
      text-decoration: none;
      font-family: monospace;
      font-size: 1em;
      transition: background 0.18s, box-shadow 0.18s;
      box-shadow: 0 1px 4px #0002;
      cursor: pointer;
    }
    .file-icon {
      font-size: 1.1em;
    }
    /* flags */
    .flags-block {
      margin: 1em 0 0.5em 0;
    }
    .flags-delete-all {
      cursor: pointer;
    }
    .flags-list {
      margin: 0.2em 0 0 1.2em;
      padding: 0;
      list-style: none;
    }
    .flag-item {
      border-radius: 0.5em;
      margin-bottom: 0.3em;
      margin-right: 0.5em;
      display: inline-block;
      position: relative;
      min-width: 6em;
      padding: 0.3em 0.7em;
    }
    .flag-remove {
      position: absolute;
      top: 0.15em; right: 0.3em;
      cursor: pointer;
      color: #b52a37;
      font-weight: bold;
      font-size: 1.1em;
      user-select: none;
      line-height: 1;
    }
    /* flag input form */
    .flag-form {
      margin: 0.5em 0;
      display: flex;
      gap: 1.2em;
      align-items: center;
      justify-content: center;
    }
    .flag-input {
      width: 440px;
      max-width: 90vw;
      padding: 0.85em 1.6em;
      border-radius: 12px;
      border: 3px solid #17a2b8;
      background: #101c1f;
      color: #e0ffe0;
      font-family: monospace;
      font-size: 1.2em;
      text-align: center;
    }
    .flag-submit-btn {
      padding: 0.85em 2.1em;
      background: #17a2b8;
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 1.38em;
      font-family: monospace;
      transition: background 0.2s;
      cursor: pointer;
    }
    .flag-error {
      text-align: center;
      font-size: 1.08em;
    }
    .locked-msg {
      color: #b52a37;
      margin: 1em 0;
      text-align: center;
      font-weight: bold;
    }
    .solved-msg {
      color: green;
      margin-top: 0.5em;
      text-align: center;
    }
    /* inline meta spans */
    .inline-tag {
      padding: 0.15em 0.6em;
      border-radius: 0.7em;
      margin-right: 0.3em;
      display: inline-block;
    }
  `;

  constructor() {
    super();
    this.ctfId = null;
    this.ctfUrl = '';
    this._challenge = null;
    this.open = false;
    this.loading = false;
    this.error_str = '';
    this.flagDraft = '';
    this.showSolvesBox = false;
    this._solvesBoxChallengeId = null;
    this._solvesBoxCtfId = null;
    this.flags = [];
    this._justSolved = false;
    this.showMagic = false;
    this.viewOnly = false;
  }

  async fetchChallenge(forceRefresh = false) {
    const ctfId = this.ctfId;
    const challenge = this.challenge;
    if (ctfId == null || !challenge || !challenge.id) return;
    this._forceRefresh = forceRefresh;
    this.loading = true;
    this.error_str = '';
    this.requestUpdate();
    try {
      let url = `/challenge/${encodeURIComponent(ctfId)}/${encodeURIComponent(challenge.id)}`;
      if (forceRefresh) url += '?refresh=1';
      const resp = await fetch(url, { cache: 'reload' });
      if (!resp.ok) throw new Error('Failed to fetch challenge info');
      const data = await resp.json();
      const prevSolvedByMe = challenge.solved_by_me;
      this.challenge = data.challenge;
      if (this.viewOnly) {
        this.challenge.solved_by_me = prevSolvedByMe;
        this.flags = [];
      }
      this.flags = Array.isArray(data.flags) ? data.flags.map(f => ({
        ...f,
        value: f.value !== undefined ? f.value : (f.submission !== undefined ? f.submission : '')
      })) : [];
      this.challenge.flags = this.flags;
      if (Array.isArray(data.hints)) {
        this.challenge.hints = data.hints.map(h => ({ ...h, _loading: false, content: h.content || h.description || '' }));
      } else {
        this.challenge.hints = [];
      }
      // Notify parent list so it can sync the fresh solve count (and other fields) back
      // into ctfData.challenges without requiring a full force-refresh.
      this.dispatchEvent(new CustomEvent('challenge-updated', {
        bubbles: true,
        composed: true,
        detail: { challenge: this.challenge }
      }));
    } catch (e) {
      this.error_str = 'Failed to load challenge info.';
    } finally {
      this.loading = false;
      this._forceRefresh = false;
      this.requestUpdate();
    }
  }

  _dispatchFlagsChanged() {
    this.dispatchEvent(new CustomEvent('challenge-flags-changed', {
      bubbles: true, composed: true,
      detail: { challengeId: this.challenge && this.challenge.id, flags: this.flags || [] }
    }));
  }

  close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close-ctf-challenge', { bubbles: true, composed: true }));
  }

  async _submitFlag(e) {
    e.preventDefault();
    const flag = this.flagDraft.trim();
    if (!flag) return;
    let ch = this.challenge;
    if (ch.solved_by_me === true) return;
    if (!Array.isArray(this.flags)) this.flags = [];
    const exists = this.flags.some(f => (f.value || '').trim() === flag);
    if (exists) {
      this.error_str = 'Duplicate flag ignored: ' + flag;
      this.flagDraft = '';
      this.requestUpdate();
      return;
    }
    this.error_str = '';
    let newFlagId = null;
    try {
      const resp = await fetch(`/add_flag/${encodeURIComponent(this.ctfId)}/${encodeURIComponent(ch.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag })
      });
      if (resp.ok) {
        const data = await resp.json();
        newFlagId = data.flag_id;
      }
    } catch (e) {}
    const newFlag = { value: flag, state: 'untested' };
    if (newFlagId !== null && newFlagId !== undefined) newFlag.id = newFlagId;
    this.flags = [...this.flags, newFlag];
    this.flagDraft = '';
    this.challenge = { ...this.challenge, flags: this.flags };
    this._dispatchFlagsChanged();
    this.requestUpdate();
  }

  async _testFlag(idx) {
    let ch = this.challenge;
    if (!Array.isArray(this.flags) || !this.flags[idx]) return;
    const flagId = this.flags[idx].id;
    if (flagId === undefined || flagId === null) {
      this.error_str = 'Flag has no id, please refresh.';
      this.requestUpdate();
      return;
    }
    const ctfId = this.ctfId;
    const challengeId = ch.id;
    this.challenge = { ...ch };
    this.requestUpdate();
    try {
      const resp = await fetch(`/test_flag/${encodeURIComponent(ctfId)}/${encodeURIComponent(challengeId)}/${encodeURIComponent(flagId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) {
        let errMsg = result && result.error ? result.error : (resp.statusText || 'Unknown error');
        this.error_str = `Flag test failed: ${errMsg}`;
        this.requestUpdate();
        return;
      }
      if (result.data && result.data.data && Array.isArray(result.data.data) && result.data.data[0] && result.data.data[0].status) {
        if (result.data.data[0].status === 'correct') {
          this.flags[idx].state = 'valid';
          this.challenge = { ...ch, solved_by_me: true };
          this.dispatchEvent(new CustomEvent('challenge-solved', {
            bubbles: true, composed: true,
            detail: { challengeId: ch.id }
          }));
        } else if (result.data.data[0].status === 'incorrect') {
          this.flags[idx].state = 'invalid';
        } else {
          this.error_str = 'Flag test failed: Unknown status from server.';
        }
      } else {
        this.error_str = 'Flag test failed: Malformed response from server.';
      }
      if (this.flags[idx].state === 'valid' || this.flags[idx].state === 'invalid') {
        this.error_str = '';
        this._dispatchFlagsChanged();
        this.requestUpdate();
      } else {
        this.requestUpdate();
      }
    } catch (e) {
      this.error_str = `Flag test failed: ${e.message || e}`;
    }
  }

  _removeFlag(idx) {
    let ch = this.challenge;
    if (!Array.isArray(this.flags)) return;
    if (this.flags[idx] && this.flags[idx].id !== undefined) {
      fetch(`/remove_flag/${encodeURIComponent(this.ctfId)}/${encodeURIComponent(ch.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag_id: this.flags[idx].id })
      });
    }
    this.flags.splice(idx, 1);
    this.challenge = { ...ch, flags: this.flags };
    this._dispatchFlagsChanged();
    this.requestUpdate();
  }

  async _deleteAllFlags() {
    if (!confirm('Are you sure you want to flush all the cached flags for this challenge?')) return;
    try {
      const resp = await fetch(`/delete_flags/${encodeURIComponent(this.ctfId)}/${encodeURIComponent(this.challenge.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        this.flags = [];
        this.challenge = { ...this.challenge, flags: [] };
        this._dispatchFlagsChanged();
        this.requestUpdate();
      } else {
        alert('Failed to delete flags: ' + (data.error || resp.statusText));
      }
    } catch (e) {
      alert('Failed to delete flags: ' + (e && e.message ? e.message : e));
    }
  }

  set challenge(val) {
    const old = this._challenge;
    if (val && old && val.id === old.id) {
      const richFields = ['description', 'files', 'hints', 'connection_info', 'flags'];
      const merged = { ...val };
      for (const f of richFields) {
        if (old[f] !== undefined && (val[f] === undefined || val[f] === null || (Array.isArray(val[f]) && val[f].length === 0 && Array.isArray(old[f]) && old[f].length > 0))) {
          merged[f] = old[f];
        }
      }
      this._challenge = merged;
    } else {
      this._challenge = val;
    }
    this.requestUpdate('challenge', old);
  }
  get challenge() {
    return this._challenge;
  }

  set login(val) {
    this._login = val;
    this.requestUpdate('login');
  }
  get login() {
    return this._login;
  }

  render() {
    if (this.showMagic) {
      return html`
        <div class="magic-overlay">
          <button class="magic-overlay-close" @click=${() => { this.showMagic = false; }}>&times;</button>
          <div class="magic-overlay-inner">
            <ctf-magic-box style="width:100vw;height:100vh;background:#181c1b;border-radius:0;box-shadow:none;margin:0;padding:0;"></ctf-magic-box>
          </div>
        </div>
      `;
    }
    if (!this.open || !this.challenge) return html``;
    const ch = this.challenge;
    if (Array.isArray(ch.hints)) {
      ch.hints = ch.hints.map(h => ({ ...h, _loading: h._loading || false, content: h.content || h.description || '' }));
    }
    const knownTagStyles = {
      intro:  { background: '#cfe2ff', color: '#222' },
      easy:   { background: '#7ec6b2', color: '#222' },
      medium: { background: '#ffb347', color: '#222' },
      hard:   { background: '#b52a37', color: '#fff' },
      insane: { background: '#7d3cff', color: '#fff' },
    };
    function tagHue(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
      return hash % 360;
    }
    function tagStyle(tag) {
      const t = (tag.value || tag).toLowerCase();
      if (knownTagStyles[t]) {
        const s = knownTagStyles[t];
        return `background:${s.background};color:${s.color};`;
      }
      const hue = tagHue(t);
      return `background:hsl(${hue},55%,28%);color:hsl(${hue},80%,85%);`;
    }

    // File links
    let fileLinks = '';
    if (Array.isArray(ch.files) && ch.files.length > 0) {
      let ctfUrl = this.ctfUrl ? this.ctfUrl.replace(/\/$/, '') : '';
      fileLinks = html`
        <div class="files-block">
          <b>Files:</b>
          <ul class="files-list">
            ${ch.files.map(f => {
              let filename = f.split('/').pop().split('?')[0];
              let url = /^https?:\/\//.test(f) ? f : ctfUrl + f;
              return html`<li>
                <a href="${url}" target="_blank" rel="noopener" class="file-link">
                  <span class="file-icon">💾</span>
                  <span>${filename}</span>
                </a>
              </li>`;
            })}
          </ul>
        </div>
      `;
    }

    const isLocked = typeof ch.max_attempts === 'number' && ch.max_attempts > 0 && typeof ch.attempts === 'number' && ch.attempts >= ch.max_attempts && ch.solved_by_me !== true;
    const hasValidFlag = Array.isArray(this.flags) && this.flags.some(f => f.state === 'valid');

    let flagList = '';
    let flagInput = '';
    if (!this.viewOnly) {
      if (Array.isArray(this.flags) && this.flags.length > 0) {
        flagList = html`
          <div class="flags-block">
            <b class="flags-delete-all" title="Delete all flags for this challenge" @click=${() => this._deleteAllFlags()}>
              ${this.flags.length === 1 ? 'Flag' : 'Flags'}:
            </b>
            <ul class="flags-list">
              ${this.flags.map((f, idx) => {
                let bg = '#eee';
                if (f.state === 'valid') bg = '#13ac13';
                else if (f.state === 'invalid') bg = '#b52a37';
                else bg = '#444';
                let flagSpan = html`<span
                  style="cursor:${f.state === 'untested' ? 'pointer' : 'default'};"
                  title="${f.state === 'untested' ? 'Test this flag' : (['valid','invalid'].includes(f.state) && f.submitted_at ? 'Submitted: ' + new Date(f.submitted_at).toLocaleString() : '')}"
                  @click=${f.state === 'untested' ? (e => { e.stopPropagation(); this._testFlag(idx); }) : null}
                >${f.value}</span>`;
                return html`<li class="flag-item" style="background:${bg};">
                  ${f.state === 'untested' ? html`
                    <span class="flag-remove"
                          @click=${e => { e.stopPropagation(); this._removeFlag(idx); }}
                          title="Remove this untested flag">×</span>
                  ` : ''}
                  ${flagSpan}
                </li>`;
              })}
            </ul>
          </div>
        `;
      }
      if (ch.solved_by_me === true || hasValidFlag) {
        flagInput = '';
      } else if (!isLocked) {
        flagInput = html`
          <form class="flag-form" @submit=${e => this._submitFlag(e)}>
            <input type="text" name="flag" placeholder="Add the flag, then click to test."
              class="flag-input"
              .value=${this.flagDraft || ''}
              @input=${e => this.flagDraft = e.target.value}
              required />
            <button type="submit" class="flag-submit-btn">Add</button>
          </form>
          ${this.error_str ? html`<div class="error flag-error">${this.error_str}</div>` : ''}
        `;
      } else if (isLocked) {
        flagInput = html`<div class="locked-msg">No more attempts allowed for this challenge.</div>`;
      }
    }

    // Hints
    let hintsBlock = '';
    if (Array.isArray(ch.hints) && ch.hints.length > 0) {
      hintsBlock = html`
        <div class="hints-block">
          <ul class="hints-list">
            ${ch.hints.map((hint, idx) => {
              const hasContent = hint.content && hint.content.trim() !== '';
              const hasError = hint._error && hint._error.trim() !== '';
              return html`<li>
                <button
                  style="background:${hasContent ? '#444' : '#222'}; color:#ffb347; border:1px solid ${hasContent ? '#888' : '#ffb347'}; border-radius:0.5em; padding:0.4em 1.2em; font-size:1em; margin-right:0.7em;${hasContent ? 'cursor:default;box-shadow:0 0 8px 2px #8885 inset,0 2px 8px #0003;' : 'cursor:pointer;'}"
                  ?disabled=${hint._loading || hasContent}
                  @click=${!hasContent && !hint._loading ? (() => this._showHint(idx, hint)) : undefined}
                >💡 ${hint.title} (${hint.cost === 0 ? 'free' : (hint.cost === 1 ? '1 pt' : hint.cost + ' pts')})
                </button>
                ${hint._loading ? html`<span class="hint-loading">Loading...</span>` : ''}
                ${hasContent ? html`<span class="hint-content">${hint.content}</span>` : ''}
                ${hasError ? html`<div class="hint-error">${hint._error}</div>` : ''}
              </li>`;
            })}
          </ul>
        </div>
      `;
    }

    return html`
      <div>
        ${this.loading ? html`<div class="loading">Loading...</div>` : ''}
        <h2 class="challenge-header">
          <span class="challenge-title">
            ${ch.name || ch.title || 'Unnamed Challenge'}
            ${ch.attribution ? html`<span class="challenge-attribution">by <b>${ch.attribution}</b></span>` : ''}
          </span>
          <button title="Magic" @click=${() => { this.showMagic = true; }} class="magic-btn">🪄</button>
          <button class="refresh-btn" style="margin-left:0.5em;" title="Refresh this challenge" @click=${() => this.fetchChallenge(true)}>🔄</button>
          <button class="close-btn" title="Close" style="margin-left:0.5em;float:none;" @click=${() => this.close()}>&times;</button>
        </h2>
        <div class="meta">
          ${ch.category ? html`<span class="meta-category">Category: <b>${ch.category}</b></span>` : ''}
          ${ch.tags && ch.tags.length ? html`
            <span class="meta-tags">
              ${ch.tags.map(tag => html`<span class="inline-tag" style="${tagStyle(tag)}">${tag.value || tag}</span>`)}
            </span>
          ` : ''}
          ${ch.value ? html`<span class="meta-points">Points: <b>${ch.value}</b></span>` : ''}
          ${typeof ch.solves === 'number' ? html`<span class="meta-solves" @click=${() => {
            this._solvesBoxChallengeId = ch.id;
            this._solvesBoxCtfId = this.ctfId;
            this.showSolvesBox = true;
            this.requestUpdate();
          }}>Solves: <b>${ch.solves}</b></span>` : ''}
          ${typeof ch.max_attempts === 'number' && ch.max_attempts > 0 ? html`
            <span class="meta-attempts">
              ${this.viewOnly
                ? html`Max attempts: <b>${ch.max_attempts}</b>`
                : html`Attempts: <b>${ch.attempts || 0}/${ch.max_attempts}</b>`}
            </span>
          ` : ''}
        </div>
        <div class="desc">${unsafeHTML(this._renderDescription(ch.description || 'No description.'))}</div>
        ${ch.connection_info != null ? html`<div class="connection-info">${ch.connection_info}</div>` : ''}
        ${hintsBlock}
        ${fileLinks}
        ${flagList}
        ${flagInput}
        ${ch.solved_by_me === true || hasValidFlag ? html`<div class="solved-msg">✔ Solved</div>` : ''}
        ${this.showSolvesBox && this._solvesBoxChallengeId ? html`
          <ctf-solves-box
            .ctfId=${this._solvesBoxCtfId}
            .challengeId=${this._solvesBoxChallengeId}
            .open=${this.showSolvesBox}
            @close-solves-box=${() => { this.showSolvesBox = false; this.requestUpdate(); }}
          ></ctf-solves-box>
        ` : ''}
      </div>
    `;
  }

  async _showHint(idx, hint) {
    if (hint._loading || (hint.content && hint.content.trim() !== '')) return;
    if (hint.cost && Number(hint.cost) > 0) {
      const ok = confirm(`This hint costs ${hint.cost} point${hint.cost == 1 ? '' : 's'}. Are you sure you want to unlock it?`);
      if (!ok) return;
    }
    this.challenge.hints[idx]._loading = true;
    this.challenge.hints[idx]._error = '';
    this.requestUpdate();
    try {
      const resp = await fetch(`/hint/${encodeURIComponent(this.ctfId)}/${encodeURIComponent(this.challenge.id)}/${encodeURIComponent(hint.id)}`);
      if (!resp.ok) {
        let errMsg = `Failed to fetch hint: ${resp.status} ${resp.statusText}`;
        try {
          const data = await resp.json();
          if (data && data.error) errMsg += ` - ${data.error}`;
        } catch {}
        this.challenge.hints[idx]._error = errMsg;
        console.error(errMsg);
        return;
      }
      const data = await resp.json();
      if (!data || typeof data.content === 'undefined') {
        this.challenge.hints[idx]._error = 'No hint content returned from server.';
        return;
      }
      this.challenge.hints[idx].content = data.content || '';
      this.challenge.hints[idx]._error = '';
    } catch (e) {
      this.challenge.hints[idx]._error = 'Failed to load hint: ' + (e && e.message ? e.message : e);
      console.error('Failed to load hint:', e);
    } finally {
      this.challenge.hints[idx]._loading = false;
      this.requestUpdate();
    }
  }

  _renderDescription(raw) {
    let descHtml;
    try {
      descHtml = marked.parse(raw);
    } catch (e) {
      descHtml = raw;
    }
    if (this.ctfId == null) return descHtml;
    const id = encodeURIComponent(this.ctfId);
    const ctfOrigin = this.ctfUrl ? this.ctfUrl.replace(/\/$/, '') : null;
    if (ctfOrigin) {
      const escapedOrigin = ctfOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      descHtml = descHtml.replace(new RegExp(escapedOrigin + '(/[^"\'\\s>]*)', 'g'), '$1');
    }
    const re = new RegExp(`((?:src|href)=["'])((?!https?://|/cached_file/|/api/)/[^"']+)(["'])`, 'g');
    const qs = this._forceRefresh ? '?refresh=1' : '';
    return descHtml.replace(re, (_, prefix, path, suffix) => `${prefix}/cached_file/${id}${path}${qs}${suffix}`);
  }
}

customElements.define('ctf-challenge', CtfChallenge);
