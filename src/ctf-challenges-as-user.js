import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

export class CtfChallengesAsUser extends LitElement {
  static properties = {
    ctfId: { type: Number },
    userId: { type: Number },
    userName: { type: String },
    ctfData: { type: Object }, // Full backend JSON for this user/ctf
    ctfUrl: { type: String },
    open: { type: Boolean },
  };

  static styles = [
    css`
      .refresh-btn:hover {
        background: #0056b3;
      }
      .ctf-username {
        display: inline-block;
        font-size: 1.6em;
        font-weight: 800;
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
        animation: none;
        transition: none;
        text-shadow: none;
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
    `
  ];

  constructor() {
    super();
    this.ctfId = null;
    this.userId = null;
    this.userName = '';
    this.ctfData = null; // Will hold the full backend JSON for this user/ctf
    this.ctfUrl = '';
    this.open = false;
    this.hideSolved = false;
    this.isLoading = false;
    this.updatingChallengeId = null;
  }

  async connectedCallback() {
    super.connectedCallback();
    // Get ctfId from localStorage and userId/username from URL parameters (?user_id=...&username=...)
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('user_id');
    const userName = params.get('username');
    const ctfId = localStorage.getItem('last-opened-ctf');
    if (ctfId && userId) {
      this.ctfId = Number(ctfId);
      this.userId = Number(userId);
      this.userName = userName || `User #${userId}`;
      await this.loadChallenges();
    } else {
      console.warn('[CtfChallengesAsUser] Missing ctfId or userId', { ctfId, userId });
    }
  }

  async loadChallenges(forceRefresh = false) {
    if (this.ctfId === null || this.ctfId === undefined || this.userId === null || this.userId === undefined) {
      console.warn('[CtfChallengesAsUser] loadChallenges: missing ctfId or userId', { ctfId: this.ctfId, userId: this.userId });
      return;
    }
    this.isLoading = true;
    this.requestUpdate();
    try {
      // Fetch all challenges for the CTF (full JSON)
      let url = `/challenges/${this.ctfId}`;
      if (forceRefresh) {
        url += '?refresh=1';
      }
      const allResp = await fetch(url);
      if (!allResp.ok) throw new Error('Failed to fetch all challenges');
      
      const allData = await allResp.json();

      this.ctfName = allData.name;
      const allChallenges = allData.challenge || allData.data || allData.challenges || [];

      // Fetch solved challenge IDs for the user
      const solvedResp = await fetch(`/${this.ctfId}/users/${this.userId}`);
      if (!solvedResp.ok) throw new Error('Failed to fetch user solved challenges');
      const solvedData = await solvedResp.json();
      const solvedIds = new Set(solvedData.solved_ids || []);
      // Attach solved_by_user to each challenge
      if (Array.isArray(allData.challenge)) {
        for (const ch of allData.challenge) {
          ch.solved_by_user = solvedIds.has(ch.id);
        }
      }
      this.ctfData = allData;
      if (allData.url) this.ctfUrl = allData.url;
      if (allData.name) this.ctfName = allData.name;
      if (forceRefresh) {
        // Group and sort challenges as in render
        const grouped = {};
        const tagOrder = ['intro', 'easy', 'medium', 'hard', 'insane'];
        function tagRank(tags) {
          if (!tags || !tags.length) return 999;
          const tagVals = tags.map(t => (t.value || t).toLowerCase());
          for (const tag of tagOrder) {
            if (tagVals.includes(tag)) return tagOrder.indexOf(tag);
          }
          return 999;
        }
        for (const ch of allChallenges) {
          const cat = ch.category || 'Uncategorized';
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(ch);
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
        let updatedChallenges = [];
        for (const ch of fetchOrder) {
          this.updatingChallengeId = ch.id;
          this.requestUpdate();
          try {
            let detailUrl = `/challenge/${this.ctfId}/${ch.id}`;
            if (forceRefresh) detailUrl += '?refresh=1';
            const resp = await fetch(detailUrl);
            let chDetails = ch;
            if (resp.ok) {
              const details = await resp.json();
              chDetails = { ...ch, ...(details.challenge || details) };
            }
            chDetails.solved_by_user = solvedIds.has(ch.id);
            updatedChallenges.push(chDetails);
          } catch (e) {
            ch.solved_by_user = solvedIds.has(ch.id);
            updatedChallenges.push(ch);
          }
          // Remove highlight after a short delay
          await new Promise(res => setTimeout(res, 350));
          if (this.updatingChallengeId === ch.id) {
            this.updatingChallengeId = null;
            this.requestUpdate();
          }
          this.challenges = [...updatedChallenges, ...fetchOrder.slice(updatedChallenges.length)];
          this.requestUpdate();
        }
        this.ctfData.challenges = updatedChallenges;
        this.requestUpdate();
      }
    } catch (e) {
      this.ctfData = null;
      console.error('[CtfChallengesAsUser] Failed to load user challenges.', e);
      alert('Failed to load user challenges.');
      this.requestUpdate();
    }
    this.isLoading = false;
    this.requestUpdate();
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
      if (ch.solved_by_user === true) solved++;
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
    let displayName = this.userName || '';
    let ctfName = '';
    if (typeof ctfData.name === 'string' && ctfData.name) {
      ctfName = ctfData.name;
    }
    return html`
      <div style="padding:1em; background:#0008; min-width: 350px; position:relative;">
        <div style="display:flex;align-items:center;gap:0.7em;position:relative;justify-content:space-between;">
          <div style="flex:1 1 0;">
            <button
              title="Refresh all challenges"
              class="refresh-btn${this.isLoading ? ' spinning' : ''}"
              style="font-size:1.6em; border: none; border-radius: 4px; background: rgb(16, 22, 21); padding: 0em 0em; cursor: pointer;"
              @click=${() => this.loadChallenges(true)}
              ?disabled=${this.isLoading}
            >🔄</button>
          </div>
          <div style="flex:2 1 0; display:flex; justify-content:center; align-items:center;">
            ${ctfName ? html`<span style="font-size:2.4em;font-weight:900;background: linear-gradient(90deg, #00ffe7 0%, #00aaff 30%, #7d3cff 65%, #ff3c6f 100%);-webkit-background-clip: text;-webkit-text-fill-color: transparent;background-clip: text;text-fill-color: transparent;text-shadow: 0 1px 8px #00ffe755, 0 1px 0 #222, 0 0 2px #ff3c6f99;letter-spacing: 0.02em;border-radius: 0.2em;padding: 0.03em 0.15em;display: inline-block; text-align:center;">${unsafeHTML(ctfName)}</span>` : ''}
          </div>
          <span
            @click=${this.toggleHideSolved.bind(this)}
            title=${this.hideSolved ? "Show all" : "Hide solved"}
            style="font-size:1.6em;cursor:pointer;user-select:none;"
          >${this.hideSolved ? '🙈' : '🐵'}</span>
        </div>
        <h2 style="margin-bottom:0.5em; display: flex; align-items: center; justify-content: center; gap: 0.7em; flex-wrap: wrap; text-align: center;">
          ${displayName ? html`<span class="ctf-username">${unsafeHTML(displayName)}</span>` : ''}
          <span style="font-size:0.9em; color:#555;">
            ${solved}/${total} solved (${total > 0 ? Math.round((solved/total)*100) : 0}%)
            ${(() => {
              let solvedPoints = 0;
              let totalPoints = 0;
              for (const ch of challenges) {
                const val = Number(ch.value) || 0;
                totalPoints += val;
                if (ch.solved_by_user === true) solvedPoints += val;
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
                const visibleChs = chs.filter(ch => !this.hideSolved || ch.solved_by_user !== true);
                if (visibleChs.length === 0) return '';
                const catSolved = chs.filter(ch => ch.solved_by_user === true).length;
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
                    let baseBg = '#222';
                    let baseColor = '#e0ffe0';
                    if (ch.solved_by_user) {
                      baseBg = '#1a3a1a';
                      baseColor = '#7fff7f';
                    }
                    return html`
                    <tr class="ctf-ch-row ${ch.solved_by_user ? 'solved' : 'unsolved'}${this.updatingChallengeId === ch.id ? ' updating' : ''}"
                      style="background-color:${baseBg}; color:${baseColor}; transition:background-color 0.2s;">
                      <td style="padding:0.1em 0.05em; border-bottom:1px solid #333;">
                        ${ch.solved_by_user === true
                          ? html`<span style='color:#7fff7f; font-size:1.5em; margin-left:0.2em;'>✔</span>`
                          : html`<span style='color:#ff7f7f; font-size:1.5em; margin-left:0.2em;'>✗</span>`}
                      </td>
                      <td style="padding:0.1em 0.05em; border-bottom:1px solid #333; font-weight:bold; color:#7fffd4;">
                        ${ch.name || ch.title || `Challenge #${ch.id}`}
                      </td>
                      <td style="padding:0.1em 0.05em; border-bottom:1px solid #333; color:#aaa; text-align:center;">
                        ${ch.tags && ch.tags.length ? ch.tags.map(t => html`<span class="ctf-tag" data-tag="${(t.value || t).toLowerCase()}">${t.value || t}</span>`) : ''}
                      </td>
                      <td style="padding:0.1em 0.05em; border-bottom:1px solid #333; color:#ffd700; text-align:center;">
                        ${ch.value || ''}
                      </td>
                      <td style="padding:0.1em 0.05em; border-bottom:1px solid #333; color:#b0e0e6; text-align:center;">
                        ${typeof ch.solves === 'number' ? ch.solves : ''}
                      </td>
                    </tr>
                  `})}
                `;
              })}
            </tbody>
          </table>
        </div>
        ${Object.keys(grouped).length === 0 ? html`<p>No challenges found.</p>` : ''}
      </div>
    `;
  }

  toggleHideSolved(e) {
    this.hideSolved = !this.hideSolved;
    this.requestUpdate();
  }
}

customElements.define('ctf-challenges-as-user', CtfChallengesAsUser);
