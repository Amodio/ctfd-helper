import { LitElement, html, css } from 'lit';

export class CtfMagicBox extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      background: #181c1b;
      color: #e0ffe0;
      border-radius: 1.5em;
      box-shadow: 0 2px 16px #0008;
      font-family: monospace, system-ui, sans-serif;
      position: relative;
    }
    .content {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2em;
      box-sizing: border-box;
    }
    h1 {
      color: #7d3cff;
      margin-bottom: 1em;
      font-size: 2.2em;
    }
    p {
      color: #e0e0ff;
      font-size: 1.2em;
      margin-bottom: 2em;
    }
  `;

  render() {
    return html`
      <div class="content">
        <h1>🪄 Magic Box</h1>
        <p>Need to add a webRTC powered chat here!</p>
      </div>
    `;
  }
}

customElements.define('ctf-magic-box', CtfMagicBox);
