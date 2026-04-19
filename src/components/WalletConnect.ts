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
    isConnecting: { type: Boolean },
    selectedWallet: { type: String },
    detectedWallets: { state: true },
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
    button:disabled,
    select:disabled {
      cursor: not-allowed;
      opacity: 0.7;
    }
    label {
      display: grid;
      gap: var(--size-1, 4px);
      font-size: var(--font-size-1, 0.875rem);
      color: var(--gray-7, #495057);
    }
    select {
      border: 1px solid var(--gray-4, #ced4da);
      border-radius: var(--radius-2, 4px);
      padding: var(--size-2, 8px);
      font: inherit;
      background: var(--surface-1, #fff);
      color: var(--gray-9, #212529);
    }
    p {
      font-size: var(--font-size-1, 0.875rem);
      color: var(--gray-7, #495057);
    }
  `;

  declare status: string;
  declare walletName: string;
  declare isConnecting: boolean;
  declare selectedWallet: string;
  declare detectedWallets: string[];
  private _walletScanTimer: number | undefined;

  private readonly _handleConnectClick = () => {
    console.log("[WalletConnect] Direct button click fired");
    void this._connect();
  };

  private readonly _handleWalletChange = (event: Event) => {
    const select = event.currentTarget as HTMLSelectElement;
    this.selectedWallet = select.value;
    this.status = this.selectedWallet ? "Ready to connect" : "Select a wallet";
    console.log("[WalletConnect] Selected wallet changed:", this.selectedWallet);
  };

  private readonly _handleRefreshClick = () => {
    console.log("[WalletConnect] Manual wallet scan requested");
    this._scanForWallets();
  };

  constructor() {
    super();
    this.status = "Disconnected";
    this.walletName = "";
    this.isConnecting = false;
    this.selectedWallet = "";
    this.detectedWallets = [];
    console.log("[WalletConnect] Constructor called - component instantiating");
  }

  override connectedCallback() {
    super.connectedCallback();
    console.log("[WalletConnect] connectedCallback - component mounted to DOM");
    this.status = "Scanning for wallets...";
    this._scanForWallets();

    if (typeof window !== "undefined") {
      window.addEventListener("focus", this._scanForWallets);
      window.addEventListener("load", this._scanForWallets);
    }
  }

  override firstUpdated() {
    const button = this.shadowRoot?.getElementById("connect-wallet-button");
    const select = this.shadowRoot?.getElementById("wallet-select");
    const refreshButton = this.shadowRoot?.getElementById("refresh-wallets-button");

    if (button instanceof HTMLButtonElement) {
      button.addEventListener("click", this._handleConnectClick);
      console.log("[WalletConnect] Attached direct click listener to button");
    }

    if (select instanceof HTMLSelectElement) {
      select.addEventListener("change", this._handleWalletChange);
      console.log("[WalletConnect] Attached change listener to wallet selector");
    }

    if (refreshButton instanceof HTMLButtonElement) {
      refreshButton.addEventListener("click", this._handleRefreshClick);
      console.log("[WalletConnect] Attached click listener to refresh button");
    }

    if (typeof window !== "undefined") {
      window.setTimeout(() => this._scanForWallets(), 300);
      window.setTimeout(() => this._scanForWallets(), 1000);
      this._walletScanTimer = window.setInterval(() => {
        if (this.detectedWallets.length > 0) {
          if (this._walletScanTimer !== undefined) {
            window.clearInterval(this._walletScanTimer);
            this._walletScanTimer = undefined;
          }
          return;
        }

        this._scanForWallets();
      }, 1500);
    }
  }

  override disconnectedCallback() {
    const button = this.shadowRoot?.getElementById("connect-wallet-button");
    const select = this.shadowRoot?.getElementById("wallet-select");
    const refreshButton = this.shadowRoot?.getElementById("refresh-wallets-button");

    if (button instanceof HTMLButtonElement) {
      button.removeEventListener("click", this._handleConnectClick);
    }

    if (select instanceof HTMLSelectElement) {
      select.removeEventListener("change", this._handleWalletChange);
    }

    if (refreshButton instanceof HTMLButtonElement) {
      refreshButton.removeEventListener("click", this._handleRefreshClick);
    }

    if (typeof window !== "undefined") {
      window.removeEventListener("focus", this._scanForWallets);
      window.removeEventListener("load", this._scanForWallets);
      if (this._walletScanTimer !== undefined) {
        window.clearInterval(this._walletScanTimer);
        this._walletScanTimer = undefined;
      }
    }

    super.disconnectedCallback();
  }

  private get _providers(): Record<string, Cip30Provider | undefined> {
    if (typeof window === "undefined") {
      return {};
    }

    return (window as CardanoWindow).cardano ?? {};
  }

  private get _availableWallets(): string[] {
    return Object.keys(this._providers).filter(
      (name) => typeof this._providers[name]?.enable === "function",
    );
  }

  private _scanForWallets = () => {
    const providerKeys = Object.keys(this._providers);
    const wallets = this._availableWallets;

    this.detectedWallets = wallets;

    if (!wallets.length) {
      this.selectedWallet = "";
      this.status = "No CIP-30 wallet detected";
      console.log("[WalletConnect] Raw cardano keys:", providerKeys);
      console.log("[WalletConnect] No wallet providers with enable() found");
      return;
    }

    if (!wallets.includes(this.selectedWallet)) {
      this.selectedWallet = wallets[0] ?? "";
    }

    if (!this.walletName) {
      this.status = this.selectedWallet ? "Ready to connect" : "Select a wallet";
    }

    console.log("[WalletConnect] Raw cardano keys:", providerKeys);
    console.log("[WalletConnect] Available wallets:", wallets);
  };

  private async _connect() {
    console.log("[WalletConnect] _connect() called");
    if (this.isConnecting) {
      console.log("[WalletConnect] Already connecting, skipping");
      return;
    }
    this.isConnecting = true;
    this.status = "Connecting...";
    console.log("[WalletConnect] Set status to Connecting...");

    const wallets = this._availableWallets;
    this.detectedWallets = wallets;
    console.log("[WalletConnect] Available wallets detected:", wallets);
    if (!wallets.length) {
      console.error("[WalletConnect] No CIP-30 wallet detected");
      this.status = "No CIP-30 wallet detected";
      this.isConnecting = false;
      return;
    }

    const selected = this.selectedWallet || wallets[0];
    console.log("[WalletConnect] Selected wallet:", selected);
    const provider = this._providers[selected];
    if (!provider) {
      console.error("[WalletConnect] Wallet provider unavailable");
      this.status = "Wallet provider unavailable";
      this.isConnecting = false;
      return;
    }

    try {
      console.log("[WalletConnect] Calling provider.enable()...");
      await provider.enable();
      this.walletName = selected;
      this.status = "Connected";
      console.log("[WalletConnect] ✓ Connected to wallet:", selected);
      this.dispatchEvent(
        new CustomEvent("wallet-connected", {
          detail: { wallet: selected },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      console.error("[WalletConnect] Connection rejected:", error);
      this.status = "Connection rejected";
    } finally {
      this.isConnecting = false;
    }
  }

  override render() {
    console.log("[WalletConnect] render() called - status:", this.status, "isConnecting:", this.isConnecting);
    const wallets = this.detectedWallets;

    return html`
      <label for="wallet-select">
        Wallet
      </label>
      <select id="wallet-select" ?disabled=${this.isConnecting || wallets.length === 0} .value=${this.selectedWallet}>
        ${wallets.length
          ? wallets.map(
              (wallet) => html`<option value=${wallet}>${wallet}</option>`,
            )
          : html`<option value="">No wallets detected</option>`}
      </select>
      <button id="connect-wallet-button" ?disabled=${this.isConnecting || wallets.length === 0}>
        ${this.isConnecting ? "Connecting..." : "Connect Wallet"}
      </button>
      <button id="refresh-wallets-button" type="button">
        Refresh Wallets
      </button>
      <p>Status: ${this.status}${this.walletName ? ` (${this.walletName})` : ""}</p>
    `;
  }
}

if (!customElements.get("wallet-connect")) {
  console.log("[WalletConnect] Registering custom element 'wallet-connect'...");
  customElements.define("wallet-connect", WalletConnect);
  console.log("[WalletConnect] ✓ Custom element registered successfully");
} else {
  console.log("[WalletConnect] Custom element already registered");
}

export default WalletConnect;
