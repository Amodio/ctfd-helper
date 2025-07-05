import { LitElement, html, css } from 'lit';
import './ctf-challenges.js';


export class CtfList extends LitElement {
  static properties = {
    ctfs: { type: Array },
    formUrl: { type: String },
    formName: { type: String },
    formLogin: { type: String },
    formPassword: { type: String },
    showForm: { type: Boolean },
    selectedCtf: { type: Object },
    autoOpenCtfId: { type: String },
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
      max-width: 800px;
      font-family: system-ui, monospace, sans-serif;
    }
    h2 {
      margin-top: 0;
      color: #7fffd4;
      font-family: monospace;
    }
    ul {
      list-style: none;
      padding: 0;
    }
    li {
      padding: 0.5em 0.75em;
      margin: 0.25em 0;
      background: #222;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s;
      color: #e0ffe0;
      font-family: monospace;
      border: 1px solid #333;
    }
    li:hover {
      background: #26332e;
    }
    .ctf-list-name {
      font-size: 1.35em;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    form {
      background: #222;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 1em;
      margin-bottom: 1em;
      box-shadow: 0 1px 4px #0002;
      color: #e0ffe0;
    }
    label {
      display: block;
      margin-bottom: 0.5em;
      color: #7fffd4;
      font-family: monospace;
    }
    input[type="text"],
    input[type="password"] {
      width: 100%;
      padding: 0.5em;
      margin-top: 0.25em;
      margin-bottom: 0.75em;
      border: 1px solid #333;
      border-radius: 4px;
      font-size: 1em;
      background: #181c1b;
      color: #e0ffe0;
      font-family: monospace;
    }
    button {
      margin-right: 0.5em;
      padding: 0.5em 1em;
      border: none;
      border-radius: 4px;
      background: #007bff;
      color: #fff;
      font-size: 1em;
      cursor: pointer;
      transition: background 0.2s;
      font-family: monospace;
    }
    button[type="button"] {
      background: #6c757d;
    }
    button:hover {
      background: #0056b3;
    }
    button[type="button"]:hover {
      background: #495057;
    }
    #add-ctf-btn {
      background: #17a2b8;
      display: block;
      margin: 1.5em auto 0 auto;
    }
    #add-ctf-btn:hover {
      background: #117a8b;
    }
  `;
  constructor() {
    super();
    this.ctfs = [];
    this.formUrl = '';
    this.formName = '';
    this.formLogin = '';
    this.formPassword = '';
    this.showForm = false;
    this.selectedCtf = null;
    this.autoOpenCtfId = undefined;
    const lastId = localStorage.getItem('last-opened-ctf');
    if (lastId) {
      this.autoOpenCtfId = lastId;
      this.selectedCtf = { id: lastId };
      // Do not load CTFs yet; only when returning to the list
    } else {
      // Only load CTFs if not auto-opening
      this.loadCtfs();
    }
  }

  async loadCtfs() {
    try {
      const response = await fetch('/ctfs');
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      this.ctfs = data.ctfs || [];
      // Set last login from backend if available
      if (data.last_login) {
        this.formLogin = data.last_login;
      }
      // Restore last opened CTF after ctfs are loaded
      if (this.autoOpenCtfId && this.ctfs.length > 0) {
        this.showCtfById(this.autoOpenCtfId);
        this.autoOpenCtfId = undefined;
      }
    } catch (error) {
      console.error('Error loading CTFs:', error);
      alert('Failed to load CTFs.');
    }
  }

  firstUpdated() {
    // No need to call loadCtfs here; always called in constructor
  }

  showCtfById(id) {
    const ctf = this.ctfs.find(c => String(c.id) === String(id));
    if (ctf) {
      this.showChallenges(ctf);
    }
  }

  showAddCtfForm() {
    this.showForm = true;
    this.formUrl = '';
    this.formName = '';
    // Preset login from property if available
    this.formLogin = this.formLogin || '';
    this.formPassword = '';
    this.updateComplete && this.updateComplete.then(() => {
      const input = this.renderRoot.querySelector('input[type="text"]');
      if (input) input.focus();
    });
  }

  hideAddCtfForm() {
    this.showForm = false;
  }

  async handleUrlInput(e) {
    let val = e.target.value.trim();
    // Remove trailing slash for url
    if (val.endsWith('/')) val = val.slice(0, -1);
    if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
      val = 'https://' + val;
    }
    this.formUrl = val;
    const year = new Date().getFullYear();
    // Ask backend for the title from the CTFd index page
    if (val) {
      try {
        const resp = await fetch('/ctfd_title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: val })
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.title) {
            this.formName = data.title + ' ' + year;
            this.requestUpdate();
            return;
          }
        }
      } catch (err) {
        // Ignore fetch errors, fallback to default logic
      }
    }
    this.requestUpdate();
  }

  handleLoginInput(e) {
    this.formLogin = e.target.value;
  }

  handlePasswordInput(e) {
    this.formPassword = e.target.value;
  }

  async submitCtfForm(e) {
    e.preventDefault();
    let url = this.formUrl.trim();
    const name = this.formName.trim();
    const login = this.formLogin ? this.formLogin.trim() : '';
    const password = this.formPassword ? this.formPassword.trim() : '';
    if (!url || !name || !login || !password) {
      alert('URL, name, login, and password are required.');
      return;
    }
    // Always prepend https:// if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    // Update last login property for session use
    this.formLogin = login;
    const formData = new FormData();
    formData.append('url', url);
    formData.append('name', name);
    formData.append('login', login);
    formData.append('password', password);
    try {
      const response = await fetch('/create_ctf', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const err = await response.json();
        alert('Failed to add CTF: ' + (err.error || response.status));
        return;
      }
      const result = await response.json();
      await this.loadCtfs();
      const newCtf = this.ctfs.find(c => String(c.id) === String(result.ctf_id));
      if (newCtf) {
        this.showForm = false;
        this.showChallenges(newCtf);
      } else {
        window.location.reload();
      }
      this.requestUpdate();
    } catch (error) {
      alert('Failed to add CTF: ' + error);
    }
  }

  showChallenges(ctf) {
    this.selectedCtf = { ...ctf };
    this.requestUpdate();
  }

  async handleCloseChallenges() {
    // Always reload CTFs when returning to the list
    await this.loadCtfs();
    this.selectedCtf = null;
    this.requestUpdate();
  }

  async editCredentials(ctf) {
    // Prompt for new login and password
    const newLogin = prompt(`Enter new login for ${ctf.url}:`, ctf.login || '');
    if (newLogin === null) return; // Cancelled
    const newPassword = prompt(`Enter new password for ${ctf.url}:`, '');
    if (newPassword === null) return; // Cancelled
    if (!newLogin.trim() || !newPassword.trim()) {
      alert('Login and password cannot be empty.');
      return;
    }
    // Update last login property for session use
    this.formLogin = newLogin.trim();
    try {
      const resp = await fetch(`/ctf/${ctf.id}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: newLogin.trim(), password: newPassword.trim() })
      });
      if (!resp.ok) {
        const err = await resp.json();
        alert('Failed to update credentials: ' + (err.error || resp.status));
        return;
      }
      await this.loadCtfs();
      // After updating, refresh challenges if open
      if (this.selectedCtf && this.selectedCtf.id === ctf.id) {
        const ctfChallenges = this.shadowRoot.querySelector('ctf-challenges');
        if (ctfChallenges && typeof ctfChallenges.loadChallenges === 'function') {
          await ctfChallenges.loadChallenges(true);
        }
      }
    } catch (e) {
      alert('Failed to update credentials: ' + e);
    }
  }

  async deleteCtf(ctfId) {
    if (!confirm('Are you sure you want to delete this CTF? This action cannot be undone.')) return;
    try {
      const resp = await fetch(`/delete_ctf/${ctfId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to delete CTF');
      await this.loadCtfs();
    } catch (e) {
      alert('Failed to delete CTF.');
    }
  }

  render() {
    const showList = !this.selectedCtf;
    // Check for user_id in URL parameters and use ctfId from localStorage
    const params = new URLSearchParams(window.location.search);
    const userIdParam = params.get('user_id');
    const ctfIdLocal = localStorage.getItem('last-opened-ctf');
    // Accept ctfId=0 as valid, and always pass numbers
    if (userIdParam !== null && ctfIdLocal !== null) {
      // Find the CTF object to get the login, fallback to undefined
      const ctfObj = this.ctfs.find(c => String(c.id) === String(ctfIdLocal));
      const login = ctfObj && ctfObj.login ? ctfObj.login : undefined;
      console.log('[CtfList] render: ctfObj', ctfObj, 'login', login);
      return html`
        <ctf-challenges
          .ctfId=${Number(ctfIdLocal)}
          .userId=${Number(userIdParam)}
          .userName=${undefined}
          .open=${true}
          .login=${login}
          .userMode=${true}
        ></ctf-challenges>
      `;
    }
    return html`
      <div>
        ${showList && this.showForm ? html`
          <form @submit=${e => this.submitCtfForm(e)} style="margin:1em 0;">
            <label>
              CTFd URL:
              <input type="text" .value=${this.formUrl} @input=${e => this.handleUrlInput(e)} required />
            </label>
            <label>
              Name:
              <input type="text" .value=${this.formName} @input=${e => this.formName = e.target.value} required />
            </label>
            <label>
              Login:
              <input type="text" .value=${this.formLogin || ''} @input=${e => this.handleLoginInput(e)} required />
            </label>
            <label>
              Password:
              <input type="password" .value=${this.formPassword || ''} @input=${e => this.handlePasswordInput(e)} required />
            </label>
            <button type="submit">Submit</button>
            <button type="button" @click=${() => this.hideAddCtfForm()}>Cancel</button>
          </form>
        ` : ''}
        ${showList && !this.showForm ? html`
          <ul style="display: flex; flex-direction: column; align-items: center; padding: 0;">
            ${this.ctfs.map(ctf => html`
              <li style="width: 100%; max-width: 400px; display: flex; justify-content: center; align-items: center;">
                <button @click=${() => this.showChallenges(ctf)}><span class="ctf-list-name">${ctf.name}</span></button>
                <button style="margin-left:0.5em;background:#ffc107;color:#222;" @click=${() => this.editCredentials(ctf)}>Edit Credentials</button>
                <button title="Delete this CTF" style="margin-left:0.5em;background:#b52a37;color:#fff; border:none; border-radius:4px; font-size:1.1em; padding:0.3em 0.7em; cursor:pointer;" @click=${() => this.deleteCtf(ctf.id)}>🗑️</button>
              </li>
            `)}
          </ul>
          <div style="display: flex; justify-content: center;">
            <button id="add-ctf-btn" @click=${() => this.showAddCtfForm()}>New CTF</button>
          </div>
        ` : ''}
        ${!showList && this.selectedCtf ? html`
          <ctf-challenges
            .ctfId=${this.selectedCtf.id}
            .login=${this.selectedCtf.login}
            .open=${true}
            @close-ctf-challenges=${this.handleCloseChallenges.bind(this)}
          ></ctf-challenges>
        ` : ''}
      </div>
    `;
  }
}

customElements.define('ctf-list', CtfList);
