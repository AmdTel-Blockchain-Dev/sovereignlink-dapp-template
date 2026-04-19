import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * WalletConnect – Lit island for connecting a Cardano wallet (Mesh SDK).
 * Swap the stub below for real Mesh SDK calls once the library is wired up.
 */
@customElement("wallet-connect")
export class WalletConnect extends LitElement {
  static override styles = css`
    :host {
      display: inline-block;
    }
    button {
      background-color: var(--blue-6, #1971c2);
      color: #fff;
      border: none;
      border-radius: var(--radius-2, 4px);
      padding: var(--size-2, 8px) var(--size-4, 16px);
      font-size: var(--font-size-2, 1rem);
      cursor: pointer;
    }
    button:hover {
      background-color: var(--blue-7, #1864ab);
    }
  `;

  private async _connect() {
    // TODO: integrate Mesh SDK wallet connection
    console.log("WalletConnect: connecting wallet…");
  }

  override render() {
    return html`<button @click=${this._connect}>Connect Wallet</button>`;
  }
}
