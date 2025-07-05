import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

import './ctf-challenge.js';

export class CtfChallenges extends LitElement {
  static properties = {
    ctfId: { type: Number },
    ctfData: { type: Object }, // Directly use the full backend JSON structure
    ctfUrl: { type: String },
    userId: { type: Number },
    userName: { type: String },
    open: { type: Boolean },
    login: { type: String },
  };

  static styles = [
    css`
      .refresh-btn:hover {
        background: #0056b3;
      }
      button[title="List of CTF"]:hover {
        background: #6c2ebf !important;
        color: #fff !important;
      }
      .ctf-login {
        display: inline-block;
        font-size: 1.6em;
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
        /* No border, no box-shadow, no animation */
        border: none;
        box-shadow: none;
        animation: none;
        transition: none;
        text-shadow: none;
      }
      .ctf-ch-row.updating {
        animation: highlight-update 0.7s linear;
        background: #2e3cff !important;
        color: #fff !important;
      }
      @keyframes highlight-update {
        0% { background: #2e3cff; color: #fff; }
        80% { background: #2e3cff; color: #fff; }
        100% { background: inherit; color: inherit; }
      }
      .refresh-btn {
        transition: transform 0.2s;
      }
      .refresh-btn.spinning {
        animation: spin-refresh 1s linear infinite;
      }
      @keyframes spin-refresh {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(-360deg); }
      }
    `
  ];

  constructor() {
    super();
    this._ctfId = null;
    this.ctfData = null; // Will hold the full backend JSON
    this.ctfUrl = '';
    this.userId = null;
    this.userName = '';
    this.open = false;
    this.hideSolved = localStorage.getItem('ctf-hide-solved') === '1';
    this.selectedChallenge = null;
    this.updatingChallengeId = null;
    this.isLoading = false;
    // Restore login from localStorage if available
    const loginLocal = localStorage.getItem('last-ctf-login');
    if (loginLocal) {
      this._login = loginLocal;
    } else {
      this._login = '';
    }
  }

  set ctfId(val) {
    const oldVal = this._ctfId;
    // Always coerce to number if possible
    this._ctfId = (val !== null && val !== undefined) ? Number(val) : null;
    // Store ctfId in localStorage for persistence
    if (this._ctfId !== null && !isNaN(this._ctfId)) {
      localStorage.setItem('last-opened-ctf', this._ctfId);
    } else {
      localStorage.removeItem('last-opened-ctf');
    }
    // Only call requestUpdate if value actually changed
    if (this._ctfId !== oldVal) this.requestUpdate('ctfId', oldVal);
  }

  get ctfId() {
    return this._ctfId;
  }

  set login(val) {
    // If val is falsy, try to restore from localStorage
    if (!val) {
      const loginLocal = localStorage.getItem('last-ctf-login');
      if (loginLocal) {
        this._login = loginLocal;
        this.requestUpdate('login');
        return;
      }
    }
    this._login = val;
    if (val) {
      localStorage.setItem('last-ctf-login', val);
    }
    this.requestUpdate('login');
  }
  get login() {
    return this._login;
  }

  async connectedCallback() {
    super.connectedCallback();
    // Get ctfId from localStorage and userId/username from URL parameters (?user_id=...&username=...)
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('user_id');
    const hasUserName = params.get('username');
    const userName = hasUserName || this.login;
    const ctfId = localStorage.getItem('last-opened-ctf');
    if (ctfId) {
      this.ctfId = Number(ctfId);
      this.userId = Number(userId);
      this.userName = userName || `User #${userId}`;
      this.hasUserName = hasUserName;
      await this.loadChallenges();
    } else {
      console.warn('[CtfChallengesAsUser] Missing ctfId or userId', { ctfId, userId });
    }
  }

  async loadChallenges(forceRefresh = false) {
    // Fetch the full CTF JSON (all challenges, all details) in one request
    if (this.ctfId === null || this.ctfId === undefined || this.userId === null || this.userId === undefined) {
      console.warn('[CtfChallengesAsUser] loadChallenges: missing ctfId or userId', { ctfId: this.ctfId, userId: this.userId });
      return;
    }
    // Abort any previous fetches
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
      this.ctfData  = await response.json();

      const newChallenges = this.ctfData.challenges || [];
      if (this.ctfData.url) this.ctfUrl = this.ctfData.url;
      if (this.ctfData.name) this.ctfName = this.ctfData.name;
      // Always restore login from selectedCtf if available, or keep the property
      if (typeof this.selectedCtf === 'object' && this.selectedCtf && this.selectedCtf.login) {
        this.login = this.selectedCtf.login;
      }
      // Only clear challengeDetails on forceRefresh, not every fetch
      if (forceRefresh) {
        this.challengeDetails = {};
      
        // Group and sort challenges as in render
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
        // Fetch details in the order of fetchOrder
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
              if (!this.hasUserName && typeof this.challengeDetails[ch.id].solved_by_me !== 'undefined') {
                ch.solved_by_me = this.challengeDetails[ch.id].solved_by_me;
              }
              this.ctfData.challenges = [...fetchOrder];
              this.requestUpdate();
            }
            // Remove highlight after a short delay
            await new Promise(res => setTimeout(res, 350));
            if (this.updatingChallengeId === ch.id) {
              this.updatingChallengeId = null;
              this.requestUpdate();
            }
          } catch (e) {
            if (e.name === 'AbortError') return; // Stop all further processing if aborted
          }
          if (signal.aborted) return;
        }
        // Final update in case some details failed
        this.ctfData.challenges = [...fetchOrder];
        this.requestUpdate();
      }


      if(this.hasUserName) {
        console.log('[CtfChallengesAsUser] Fetching solved challenges for userId:', this.userId);
        // Fetch solved challenge IDs for the userId
        const solvedResp = await fetch(`/${this.ctfId}/users/${this.userId}`);
        if (!solvedResp.ok) throw new Error('Failed to fetch user solved challenges');
        const solvedData = await solvedResp.json();
        const solvedIds = new Set(solvedData.solved_ids || []);
        // Attach solved_by_me to each challenge
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
    // Abort any ongoing fetches
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this.open = false;
    this.ctfId = null;
    this.ctfData = null;
    this.ctfUrl = '';
    // Remove last-opened-ctf so the CTF list is shown next time
    localStorage.removeItem('last-opened-ctf');
    this.requestUpdate();
    // Clear GET parameters from the URL (user_id, username, etc.) and refresh the window
    if (window && window.history && window.location) {
      const url = new URL(window.location.href);
      url.search = '';
      window.location.href = url.toString();
      return;
    }
    // Dispatch event to show the CTF list again
    this.dispatchEvent(new CustomEvent('close-ctf-challenges', { bubbles: true, composed: true }));
    // Refresh the challenge list when returning to the CTF list
    setTimeout(() => this.loadChallenges(true), 0);
  }

  openChallenge(ch) {
    // Always fetch the latest details and flags from backend when opening a challenge
    this.selectedChallenge = { ...ch };
    this.requestUpdate();
    // Use a microtask to ensure the modal is rendered before fetching
    setTimeout(() => {
      const modal = this.shadowRoot && this.shadowRoot.querySelector('ctf-challenge');
      if (modal && typeof modal.fetchChallenge === 'function') {
        modal.fetchChallenge();
      }
    }, 0);
  }

  closeChallenge() {
    // Just close the modal, do not refresh here
    this.selectedChallenge = null;
    this.requestUpdate();
  }

  firstUpdated() {
    // Listen for refresh-challenges event from ctf-challenge
    this.addEventListener('refresh-challenges', (e) => {
      // Always refresh and close modal when event is received
      this.selectedChallenge = null;
      this.loadChallenges(true);
      this.requestUpdate();
    });
  }

  render() {
    // Use the backend JSON structure directly
    const ctfData = this.ctfData || {};
    const challenges = Array.isArray(ctfData.challenge) ? ctfData.challenge : [];
    // Group challenges by category
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
    // Sort each group by tags (custom order: intro, easy, medium, hard, insane)
    const tagOrder = ['intro', 'easy', 'medium', 'hard', 'insane'];
    function tagRank(tags) {
      if (!tags || !tags.length) return 999;
      const tagVals = tags.map(t => (t.value || t).toLowerCase());
      for (const tag of tagOrder) {
        if (tagVals.includes(tag)) return tagOrder.indexOf(tag);
      }
      return 999;
    }
    for (const cat in grouped) {
      grouped[cat].sort((a, b) => tagRank(a.tags) - tagRank(b.tags));
      grouped[cat] = grouped[cat].map(ch => {
        if (!ch.name && ch.title) ch.name = ch.title;
        if (!ch.name) ch.name = `Challenge #${ch.id}`;
        return ch;
      });
    }
    // Compute filtered counts for hideSolved
    let filteredTotal = 0;
    let filteredSolved = 0;
    for (const ch of challenges) {
      if (this.hideSolved && ch.solved_by_me === true) continue;
      filteredTotal++;
      if (ch.solved_by_me === true) filteredSolved++;
    }
    // Get the CTF name from the loaded CTF info (from backend)
    let displayName = this.userName ? this.userName : this.login;
    let ctfName = '';
    if (typeof ctfData.name === 'string' && ctfData.name) {
      ctfName = ctfData.name;
    }
    return html`
      <div style="padding:1em; background:#0008; min-width: 350px; position:relative;">
        <div style="display:flex;align-items:center;gap:0.7em;position:relative;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:0.7em;flex:1 1 0;">
            <button title="List of CTF" @click=${() => this.close()} style="font-size:1.3em; background:#26044d; color:#fff; border:1px solid #222; cursor: pointer;">
              🔙
            </button>
            <button
              title="Refresh all challenges"
              class="refresh-btn${this.isLoading ? ' spinning' : ''}"
              style="font-size:1.6em; border: none; border-radius: 4px; background: rgb(16, 22, 21); padding: 0em 0em; cursor: pointer;"
              @click=${() => this.loadChallenges(true)}
              ?disabled=${this.isLoading}
            >🔄</button>
          </div>
          <div style="flex:2 1 0; display:flex; justify-content:center; align-items:center;">
            ${ctfName ? html`<span style="font-size:2.4em;font-weight:900;background: linear-gradient(90deg, #00ffe7 0%, #00aaff 30%, #7d3cff 65%, #ff3c6f 100%);-webkit-background-clip: text;-webkit-text-fill-color: transparent;background-clip: text;text-fill-color: transparent;text-shadow: 0 1px 8px #00ffe755, 0 1px 0 #222, 0 0 2px #ff3c6f99;letter-spacing: 0.02em;border-radius: 0.2em;padding: 0.03em 0.15em;display: inline-block; text-align:center;">${ctfName}</span>` : ''}
          </div>
          <span
            @click=${() => {
              this.toggleHideSolved();
              // Force update of the title attribute after state change
              setTimeout(() => {
                const el = this.shadowRoot && this.shadowRoot.querySelector('.hide-solved-toggle');
                if (el) el.title = this.hideSolved ? 'Show all' : 'Hide solved';
              }, 0);
            }}
            class="hide-solved-toggle"
            title="${this.hideSolved ? 'Show all' : 'Hide solved'}"
            style="font-size:1.6em;cursor:pointer;user-select:none;"
          >${this.hideSolved ? '🙈' : '🐵'}</span>
        </div>
        <h2 style="margin-bottom:0.5em; display: flex; align-items: center; justify-content: center; gap: 0.7em; flex-wrap: wrap; text-align: center;">
          ${displayName ? html`<span class="ctf-login">${unsafeHTML(displayName)}</span>` : ''}
          <span style="font-size:0.9em; color:#555;">
            ${solved}/${total} solved (${total > 0 ? Math.round((solved/total)*100) : 0}%)
            ${(() => {
              let solvedPoints = 0;
              let totalPoints = 0;
              for (const ch of challenges) {
                const val = Number(ch.value) || 0;
                totalPoints += val;
                if (ch.solved_by_me === true) solvedPoints += val;
              }
              return `| ${solvedPoints}/${totalPoints} pts`;
            })()}
          </span>
        </h2>
        <div style="overflow-x:auto; margin-top:1.5em;">
          <table style="width:100%; border-collapse:collapse; background:#222; color:#eee; font-family:monospace;">
            <thead>
              <tr style="background:#111;">
                <th style="padding:0.2em 0.05em; border-bottom:1px solid #333;"></th>
                <th style="padding:0.2em 0.05em; border-bottom:1px solid #333;">Name</th>
                <th style="padding:0.2em 0.05em; border-bottom:1px solid #333; text-align:center;">Tags</th>
                <th style="padding:0.2em 0.05em; border-bottom:1px solid #333; text-align:center;">Points</th>
                <th style="padding:0.2em 0.05em; border-bottom:1px solid #333; text-align:center;">Solves</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(grouped).map(([cat, chs]) => {
                // Filter for hideSolved
                const visibleChs = chs.filter(ch => !this.hideSolved || ch.solved_by_me !== true);
                if (visibleChs.length === 0) return '';
                const catSolved = chs.filter(ch => ch.solved_by_me === true).length;
                const catTotal = chs.length;
                const catPct = catTotal > 0 ? Math.round((catSolved/catTotal)*100) : 0;
                return html`
                  <tr style="background:#191f1a;">
                    <td colspan="5" style="padding:0.7em 0.7em; border-bottom:1px solid #333; font-weight:bold; color:#00eaff; font-size:1.1em;">
                      ${cat}
                      <span style="font-size:0.9em; color:#aaa; margin-left:1.5em;">
                        ${catSolved}/${catTotal} solved (${catPct}%)
                      </span>
                    </td>
                  </tr>
                  ${visibleChs.map(ch => {
                    const isLocked = typeof ch.max_attempts === 'number' && ch.max_attempts > 0 && typeof ch.attempts === 'number' && ch.attempts >= ch.max_attempts && ch.solved_by_me !== true;
                    // Determine base colors
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
                      hoverBg = '#222'; // No hover effect for locked
                      hoverColor = '#aaa';
                    }
                    return html`
                    <tr class="ctf-ch-row ${ch.solved_by_me ? 'solved' : 'unsolved'}${this.updatingChallengeId === ch.id ? ' updating' : ''}"
                      style="background-color:${baseBg}; color:${baseColor}; transition:background-color 0.2s; opacity:${isLocked ? 0.5 : 1};cursor:pointer;"
                      @click=${() => { this.openChallenge(ch); }}
                      @mouseover=${function(e){
                        if (!isLocked) {
                          e.currentTarget.style.backgroundColor = hoverBg;
                          e.currentTarget.style.color = hoverColor;
                        }
                      }.bind(this)}
                      @mouseout=${function(e){
                        e.currentTarget.style.backgroundColor = baseBg;
                        e.currentTarget.style.color = baseColor;
                      }}
                    >
                      <td style="padding:0.1em 0.05em; border-bottom:1px solid #333;">
                        ${ch.solved_by_me === true
                          ? html`<span style='color:#7fff7f; font-size:1.5em; margin-left:0.2em;'>✔</span>`
                          : html`<span style='color:#ff7f7f; font-size:1.5em; margin-left:0.2em;'>✗</span>`}
                      </td>
                      <td style="padding:0.1em 0.05em; border-bottom:1px solid #333; font-weight:bold; color:#7fffd4;">
                        ${(() => {
                          const name = ch.name || ch.title || `Challenge #${ch.id}`;
                          const attempts = typeof ch.attempts === 'number' && !this.hasUserName ? ch.attempts : null;
                          const maxAttempts = typeof ch.max_attempts === 'number' ? ch.max_attempts : null;
                          let attemptsSpan = '';
                          if (this.hasUserName && typeof ch.max_attempts === 'number' && ch.max_attempts > 0) {
                            attemptsSpan = html`<span style="color:#ff4444;">&nbsp;&nbsp;(max attempts: ${maxAttempts})</span>`;
                          }
                          if (attempts !== null && maxAttempts !== null && maxAttempts > 0) {
                            attemptsSpan = html`<span style="color:#ff4444;">&nbsp;&nbsp;(attempts: ${attempts}/${maxAttempts})</span>`;
                          }
                          const nameWithAttempts = html`${name}${attemptsSpan}`;
                          // If attempts == maxAttempts and maxAttempts > 0, strike the line
                          if (maxAttempts !== null && maxAttempts > 0 && attempts === maxAttempts) {
                            return html`<del>${nameWithAttempts}</del>`;
                          }
                          return nameWithAttempts;
                        })()}
                      </td>
                      <td style="padding:0.1em 0.05em; border-bottom:1px solid #333; color:#aaa; text-align:center;">
                        ${isLocked
                          ? html`<del>${ch.tags && ch.tags.length ? ch.tags.map(t => html`<span class="ctf-tag" data-tag="${(t.value || t).toLowerCase()}">${t.value || t}</span>`) : ''}</del>`
                          : (ch.tags && ch.tags.length ? ch.tags.map(t => html`<span class="ctf-tag" data-tag="${(t.value || t).toLowerCase()}">${t.value || t}</span>`) : '')}
                      </td>
                      <td style="padding:0.1em 0.05em; border-bottom:1px solid #333; color:#ffd700; text-align:center;">
                        ${isLocked ? html`<del>${ch.value || ''}</del>` : (ch.value || '')}
                      </td>
                      <td style="padding:0.1em 0.05em; border-bottom:1px solid #333; color:#b0e0e6; text-align:center;">
                        ${isLocked ? html`<del>${typeof ch.solves === 'number' ? ch.solves : ''}</del>` : (typeof ch.solves === 'number' ? ch.solves : '')}
                      </td>
                    </tr>
                  `})}
                `;
              })}
            </tbody>
          </table>
        </div>
        ${Object.keys(grouped).length === 0 ? html`<p>No challenges yet, please wait a few seconds...</p>` : ''}
        ${this.selectedChallenge ? html`
          <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#0008;z-index:1000;display:flex;align-items:center;justify-content:center;"
            @click=${e => { if (e.target === e.currentTarget) this.closeChallenge(); }}
            @refresh-challenges=${() => { this.selectedChallenge = null; this.loadChallenges(true); this.requestUpdate(); }}>
            <ctf-challenge
              .ctfId=${this.ctfId}
              .ctfUrl=${this.ctfUrl}
              .challenge=${this.selectedChallenge}
              .open=${true}
              @close-ctf-challenge=${this.closeChallenge.bind(this)}
            ></ctf-challenge>
          </div>
        ` : ''}
      </div>
    `;
  }

  toggleHideSolved(e) {
    this.hideSolved = !this.hideSolved;
    if (this.hideSolved) {
      localStorage.setItem('ctf-hide-solved', '1');
    } else {
      localStorage.removeItem('ctf-hide-solved');
    }
    this.requestUpdate();
  }
}

customElements.define('ctf-challenges', CtfChallenges);
