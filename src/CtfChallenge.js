import { LitElement, html, css } from 'lit';
import './CtfSolvesBox.js';

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
      font-size:0.9em;
      border: none;
      border-radius: 4px;
      background: rgb(16, 22, 21);
      padding: 0em 0em;
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
      white-space: pre-line;
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
    this._justSolved = false; // Track if a valid flag was just submitted
  }

  updated(changedProps) {
    // Only fetch if ctfId or challenge.id changed, not on every challenge object update
    // Instead, only fetch if challenge is missing details (e.g., description is missing)
    if (
      this.open &&
      this.challenge &&
      (
        !this.challenge.description ||
        typeof this.challenge.value === 'undefined' ||
        typeof this.challenge.max_attempts === 'undefined'
      )
    ) {
      // Only fetch if essential details are missing
      this.fetchChallenge(false);
    }
    // Ensure flags are loaded from challenge object if present
    if (this.challenge) {
      if (Array.isArray(this.flags)) {
        this.challenge.flags = this.flags;
      } else {
        this.flags = Array.isArray(this.challenge.flags) ? this.challenge.flags : [];
      }
    }
  }

  async fetchChallenge(forceRefresh = false) {
    // Always get the latest values from the element's properties
    const ctfId = this.ctfId;
    const challenge = this.challenge;
    if (ctfId == null || !challenge || !challenge.id) return;
    this.loading = true;
    this.error_str = '';
    this.requestUpdate(); // Ensure UI shows loading state immediately
    try {
      let url = `/challenge/${encodeURIComponent(ctfId)}/${encodeURIComponent(challenge.id)}`;
      if (forceRefresh) url += '?refresh=1';
      const resp = await fetch(url, { cache: 'reload' });
      if (!resp.ok) throw new Error('Failed to fetch challenge info');
      const data = await resp.json();
      // data: { challenge: {...}, flags: [...], hints: [...] }
      this.challenge = data.challenge;
      // Ensure all flags have a .value property for frontend display
      this.flags = Array.isArray(data.flags) ? data.flags.map(f => ({
        ...f,
        value: f.value !== undefined ? f.value : (f.submission !== undefined ? f.submission : '')
      })) : [];
      // Also sync challenge.flags for direct rendering
      this.challenge.flags = this.flags;
      // Attach hints from backend, initializing UI state
      if (Array.isArray(data.hints)) {
        this.challenge.hints = data.hints.map(h => ({ ...h, _loading: false, content: h.content || h.description || '' }));
      } else {
        this.challenge.hints = [];
      }
    } catch (e) {
      this.error_str = 'Failed to load challenge info.';
    } finally {
      this.loading = false;
      this.requestUpdate();
    }
  }

  close() {
    this.open = false;
    // Only refresh parent if a valid flag was just submitted
    if (this._justSolved) {
      this.dispatchEvent(new CustomEvent('refresh-challenges', { bubbles: true, composed: true }));
      this._justSolved = false;
    }
    this.dispatchEvent(new CustomEvent('close-ctf-challenge', { bubbles: true, composed: true }));
  }

  async _submitFlag(e) {
    e.preventDefault();
    const flag = this.flagDraft.trim();
    if (!flag) return;
    let ch = this.challenge;
    if (ch.solved_by_me === true) return; // Prevent adding flags if already solved
    if (!Array.isArray(this.flags)) this.flags = [];
    // Prevent adding duplicate flags (trimmed, but case sensitive)
    const exists = this.flags.some(f => (f.value || '').trim() === flag);
    if (exists) {
      this.error_str = 'Duplicate flag ignored: ' + flag;
      this.flagDraft = '';
      this.requestUpdate();
      return;
    }
    this.error_str = '';
    // Save to backend: add a candidate flag using the correct route
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
    // Add to local state (with id if available)
    const newFlag = { value: flag, state: 'untested' };
    if (newFlagId !== null && newFlagId !== undefined) newFlag.id = newFlagId;
    this.flags = [...this.flags, newFlag];
    this.flagDraft = '';
    this.challenge = { ...ch, flags: this.flags };
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
      // Optionally update state based on backend response
      if (result.data && result.data.data && Array.isArray(result.data.data) && result.data.data[0] && result.data.data[0].status) {
        if (result.data.data[0].status === 'correct') {
          this.flags[idx].state = 'valid';
          // Ensure reactivity
          this.challenge = { ...ch, solved_by_me: true };
          this._justSolved = true; // Mark that a valid flag was just submitted
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
    // Save to backend: remove a candidate flag using the correct route
    if (this.flags[idx] && this.flags[idx].id !== undefined) {
      fetch(`/remove_flag/${encodeURIComponent(this.ctfId)}/${encodeURIComponent(ch.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag_id: this.flags[idx].id })
      });
    }
    this.flags.splice(idx, 1);
    this.challenge = { ...ch, flags: this.flags };
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
    this._challenge = val;
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
    if (!this.open || !this.challenge) return html``;
    const ch = this.challenge;
    // Ensure UI state for each hint if present
    if (Array.isArray(ch.hints)) {
      ch.hints = ch.hints.map(h => ({ ...h, _loading: h._loading || false, content: h.content || h.description || '' }));
    }
    // Tag color mapping by level
    const tagColors = {
      intro: '#cfe2ff',
      easy: '#7ec6b2', // darker teal for easy
      medium: '#ffb347', // orange
      hard: '#b52a37',   // red
      insane: '#7d3cff'  // purple for insane
    };
    function tagBg(tag) {
      const t = (tag.value || tag).toLowerCase();
      return tagColors[t] || '#eee';
    }
    // Render file links if present
    let fileLinks = '';
    if (Array.isArray(ch.files) && ch.files.length > 0) {
      // Use ctfUrl property passed to this component
      let ctfUrl = this.ctfUrl ? this.ctfUrl.replace(/\/$/, '') : '';
      fileLinks = html`
        <div style="margin:0.5em 0 0.5em 0;">
          <b>Files:</b>
          <ul style="margin:0.2em 0 0 1.2em; padding:0; list-style:none;">
            ${ch.files.map(f => {
              let filename = f.split('/').pop().split('?')[0];
              let url = ctfUrl + f;
              return html`<li style="display:inline-block;margin-right:0.5em;margin-bottom:0.3em;">
                <a href="${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.4em;padding:0.35em 0.9em 0.35em 0.7em;background:#222;border:1px solid #17a2b8;border-radius:0.5em;color:#00eaff;text-decoration:none;font-family:monospace;font-size:1em;transition:background 0.18s,box-shadow 0.18s;box-shadow:0 1px 4px #0002;cursor:pointer;">
                  <span style="font-size:1.1em;">💾</span>
                  <span>${filename}</span>
                </a>
              </li>`;
            })}
          </ul>
        </div>
      `;
    }
    // Render flag list always
    let flagList = '';
    let flagInput = '';
    // Determine if challenge is locked (max_attempts reached and not solved)
    const isLocked = typeof ch.max_attempts === 'number' && ch.max_attempts > 0 && typeof ch.attempts === 'number' && ch.attempts >= ch.max_attempts && ch.solved_by_me !== true;
    // Always show list of flags (if any)
    if (Array.isArray(this.flags) && this.flags.length > 0) {
      flagList = html`
        <div style="margin:1em 0 0.5em 0;">
          <b style="cursor:pointer;" title="Delete all flags for this challenge" @click=${() => this._deleteAllFlags()}>
            ${this.flags.length === 1 ? 'Flag' : 'Flags'}:
          </b>
          <ul style="margin:0.2em 0 0 1.2em; padding:0; list-style:none;">
            ${this.flags.map((f, idx) => {
              let bg = '#eee';
              if (f.state === 'valid') bg = '#13ac13';
              else if (f.state === 'invalid') bg = '#b52a37';
              else bg = '#444'; // gray for untested
              // Only show submitted_at as a tooltip on hover for tested flags
              let flagSpan = html`<span
                style="cursor:${f.state === 'untested' ? 'pointer' : 'default'};"
                title="${f.state === 'untested' ? 'Test this flag' : (['valid','invalid'].includes(f.state) && f.submitted_at ? 'Submitted: ' + new Date(f.submitted_at).toLocaleString() : '')}"
                @click=${f.state === 'untested' ? (e => { e.stopPropagation(); this._testFlag(idx); }) : null}
              >${f.value}</span>`;
              return html`<li style="background:${bg};padding:0.3em 0.7em 0.3em 0.7em;border-radius:0.5em;margin-bottom:0.3em;margin-right:0.5em;display:inline-block;position:relative;min-width:6em;">
                ${f.state === 'untested' ? html`
                  <span @click=${e => { e.stopPropagation(); this._removeFlag(idx); }}
                        title="Remove this untested flag"
                        style="position:absolute;top:0.15em;right:0.3em;cursor:pointer;color:#b52a37;font-weight:bold;font-size:1.1em;user-select:none;line-height:1;">×</span>
                ` : ''}
                ${flagSpan}
              </li>`;
            })}
          </ul>
        </div>
      `;
    }
    // Only show input form if NOT solved and NOT locked and no valid flag present
    const hasValidFlag = Array.isArray(this.flags) && this.flags.some(f => f.state === 'valid');
    if (ch.solved_by_me === true || hasValidFlag) {
      flagInput = '';
    } else if (!isLocked) {
      flagInput = html`
        <form @submit=${e => this._submitFlag(e)} style="margin:0.5em 0 0.5em 0;display:flex;gap:1.2em;align-items:center;justify-content:center;">
          <input type="text" name="flag" placeholder="Add the flag, then click to test." style="width:440px;max-width:90vw;padding:0.85em 1.6em;border-radius:12px;border:3px solid #17a2b8;background:#101c1f;color:#e0ffe0;font-family:monospace;font-size:1.2em;text-align:center;" .value=${this.flagDraft || ''} @input=${e => this.flagDraft = e.target.value} required />
          <button type="submit" style="padding:0.85em 2.1em;background:#17a2b8;color:#fff;border:none;border-radius:12px;font-size:1.38em;font-family:monospace;transition:background 0.2s;">Add</button>
        </form>
        ${this.error_str ? html`<div class="error" style="text-align:center; font-size:1.08em;">${this.error_str}</div>` : ''}
      `;
    } else if (isLocked) {
      flagInput = html`<div style="color:#b52a37; margin:1em 0; text-align:center; font-weight:bold;">No more attempts allowed for this challenge.</div>`;
    } else {
      flagInput = '';
    }
    // Render hints if present
    let hintsBlock = '';
    if (Array.isArray(ch.hints) && ch.hints.length > 0) {
      hintsBlock = html`
        <div style="margin:0.2em 0 0.7em 0; text-align:center; color:#ffb347; font-weight:bold; font-size:1.08em;">
          <ul style="list-style:none; padding:0; margin:0.5em 0 0 0; text-align:left; display:inline-block;">
            ${ch.hints.map((hint, idx) => {
              const hasContent = hint.content && hint.content.trim() !== '';
              const hasError = hint._error && hint._error.trim() !== '';
              return html`<li style="margin-bottom:0.5em;">
                <button
                  style="background:${hasContent ? '#444' : '#222'}; color:#ffb347; border:1px solid ${hasContent ? '#888' : '#ffb347'}; border-radius:0.5em; padding:0.4em 1.2em; font-size:1em; margin-right:0.7em;${hasContent ? 'cursor:default;box-shadow:0 0 8px 2px #8885 inset,0 2px 8px #0003;' : 'cursor:pointer;'}"
                  ?disabled=${hint._loading || hasContent}
                  @click=${!hasContent && !hint._loading ? (() => this._showHint(idx, hint)) : undefined}
                >💡 ${hint.title} (${hint.cost === 0 ? 'free' : (hint.cost === 1 ? '1 pt' : hint.cost + ' pts')})
                </button>
                ${hint._loading ? html`<span style="color:#888;">Loading...</span>` : ''}
                ${hasContent ? html`<span style="color:#ffd700; margin-left:0.7em;">${hint.content}</span>` : ''}
                ${hasError ? html`<div style="color:#b52a37; margin-left:0.7em; font-size:0.98em; display:inline;">${hint._error}</div>` : ''}
              </li>`;
            })}
          </ul>
        </div>
      `;
    }
    return html`
      <div>
        ${this.loading ? html`<div class="loading">Loading...</div>` : ''}
        <h2 style="display:flex;align-items:center;gap:0.5em;">
          <span style="flex:1;">
            ${ch.name || ch.title || 'Unnamed Challenge'}
            ${ch.attribution ? html`<span style="font-size:0.7em; color:#888; font-weight:normal; margin-left:0.7em;">by <b>${ch.attribution}</b></span>` : ''}
          </span>
          <button class="refresh-btn" title="Refresh this challenge" @click=${() => this.fetchChallenge(true)}>🔄</button>
          <button class="close-btn" title="Close" style="margin-left:0.5em;float:none;" @click=${() => this.close()}>&times;</button>
        </h2>
        <div class="meta">
          ${ch.category ? html`<span style="color:#00eaff;">Category: <b>${ch.category}</b></span>` : ''}
          ${ch.tags && ch.tags.length ? html`
            <span style="margin-left:1em;">
              ${ch.tags.map(tag => html`<span style="background:${tagBg(tag)};color:#222;padding:0.15em 0.6em;border-radius:0.7em;margin-right:0.3em;display:inline-block;">${tag.value || tag}</span>`) }
            </span>
          ` : ''}
          ${ch.value ? html`<span style="margin-left:1em; color:#ffd700;">Points: <b>${ch.value}</b></span>` : ''}
          ${typeof ch.solves === 'number' ? html`<span style="margin-left:1em; color:#b0e0e6; cursor:pointer;" @click=${() => {
  this._solvesBoxChallengeId = ch.id;
  this._solvesBoxCtfId = this.ctfId;
  this.showSolvesBox = true;
  this.requestUpdate();
}}>Solves: <b>${ch.solves}</b></span>` : ''}
          ${typeof ch.max_attempts === 'number' && ch.max_attempts > 0 ? html`
            <span style="margin-left:1em; color:#b52a37;">
              Attempts: <b>${ch.attempts || 0}/${ch.max_attempts}</b>
            </span>
          ` : ''}
        </div>
        <div class="desc">${ch.description || 'No description.'}</div>
        ${ch.connection_info != null ? html`<div style="margin:0.5em 0 0.5em 0; padding:0.5em; background:#181c1f; border-left:4px solid #007bff; color:#e0ffe0; font-family:monospace; white-space:pre-line;">${ch.connection_info}</div>` : ''}
        ${hintsBlock}
        ${fileLinks}
        ${flagList}
        ${flagInput}
        ${ch.solved_by_me === true || hasValidFlag ? html`<div style="color:green; margin-top:0.5em; text-align:center;">✔ Solved</div>` : ''}
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

  // Add method to fetch and show hint
  async _showHint(idx, hint) {
    if (hint._loading || (hint.content && hint.content.trim() !== '')) return;
    // If cost is non-zero, confirm with user
    if (hint.cost && Number(hint.cost) > 0) {
      const ok = confirm(`This hint costs ${hint.cost} point${hint.cost == 1 ? '' : 's'}. Are you sure you want to unlock it?`);
      if (!ok) return;
    }
    // Mark as loading and clear previous error
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
}

customElements.define('ctf-challenge', CtfChallenge);
