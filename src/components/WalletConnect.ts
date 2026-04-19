import { LitElement, css, html } from "lit";

type Cip30Provider = {
  enable: () => Promise<unknown>;
};

type CardanoWindow = Window & {
  cardano?: Record<string, Cip30Provider | undefined>;
};

/**
 * WalletConnect – Lit island for connecting a Cardano wallet (Mesh SDK).
 * Swap the stub below for real Mesh SDK calls once the library is wired up.
 */
export class WalletConnect extends LitElement {
  static properties = {
    status: { type: String },
    walletName: { type: String },
  };

  static override styles = css`
    :host {
      display: grid;
      gap: var(--size-2, 8px);
      align-items: start;
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
    p {
      font-size: var(--font-size-1, 0.875rem);
      color: var(--gray-7, #495057);
    }
  `;

  status = "Disconnected";
  walletName = "";

  private get _providers(): Record<string, Cip30Provider | undefined> {
    return (window as CardanoWindow).cardano ?? {};
  }

  private get _availableWallets(): string[] {
    return Object.keys(this._providers).filter(
      (name) => typeof this._providers[name]?.enable === "function",
    );
  }

  private async _connect() {
    const wallets = this._availableWallets;
    if (!wallets.length) {
      this.status = "No CIP-30 wallet detected";
      return;
    }

    const selected = wallets[0];
    const provider = this._providers[selected];
    if (!provider) {
      this.status = "Wallet provider unavailable";
      return;
    }

    try {
      await provider.enable();
      this.walletName = selected;
      this.status = "Connected";
      this.dispatchEvent(
        new CustomEvent("wallet-connected", {
          detail: { wallet: selected },
          bubbles: true,
          composed: true,
        }),
      );
    } catch {
      this.status = "Connection rejected";
    }
  }

  override render() {
    return html`
      <button @click=${this._connect}>Connect Wallet</button>
      <p>Status: ${this.status}${this.walletName ? ` (${this.walletName})` : ""}</p>
    `;
  }
}

if (!customElements.get("wallet-connect")) {
  customElements.define("wallet-connect", WalletConnect);
}
