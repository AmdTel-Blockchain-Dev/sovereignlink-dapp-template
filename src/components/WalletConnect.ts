import { css, html, LitElement } from "lit";
import type { SovereignProfile } from "../lib/storage.ts";
import { decrypt, encrypt, loadProfile, saveProfile } from "../lib/storage.ts";

type Cip30Provider = {
  enable: () => Promise<unknown>;
};

type Cip30EnabledApi = {
  getChangeAddress?: () => Promise<string>;
  getPubKey?: () => Promise<string>;
};

type CardanoWindow = Window & {
  cardano?: Record<string, Cip30Provider | undefined>;
};

type SessionRecord = { id: "session"; ciphertext: string };
type ProfileRecord = { id: "me"; walletKeyB64: string };

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
    did: { type: String },
    sessionToken: { type: String },
    isLoggedIn: { type: Boolean },
    detectedWallets: { state: true },
    profile: { state: true },
  };

  static override styles = css`
    :host {
      display: block;
    }
    .wallet-panel {
      display: grid;
      gap: var(--size-3);
      border: var(--border-size-1) solid var(--color-border);
      border-radius: var(--radius-3);
      background: var(--surface-2);
      padding: var(--size-4);
    }
    .wallet-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: var(--size-2);
      align-items: center;
    }
    .wallet-title {
      font-size: var(--font-size-2);
      font-weight: var(--font-weight-6);
      color: var(--color-text);
    }
    .wallet-status {
      font-size: var(--font-size-1);
      color: var(--color-text-muted);
    }
    .wallet-controls {
      display: grid;
      gap: var(--size-2);
    }
    .wallet-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--size-2);
      align-items: center;
    }
    label {
      font-size: var(--font-size-1);
      color: var(--color-text-muted);
    }
    select {
      border: var(--border-size-1) solid var(--color-border);
      border-radius: var(--radius-2);
      padding: var(--size-2);
      font: inherit;
      background: var(--surface-1);
      color: var(--color-text);
      min-inline-size: 14rem;
    }
    button {
      border: var(--border-size-1) solid var(--color-border);
      border-radius: var(--radius-2);
      padding: var(--size-2) var(--size-3);
      font: inherit;
      background: var(--surface-1);
      color: var(--color-text);
      cursor: pointer;
    }
    .primary {
      background: var(--color-brand);
      border-color: var(--color-brand-strong);
      color: var(--gray-0);
    }
    button:disabled,
    select:disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }
    .wallet-meta {
      font-size: var(--font-size-0);
      color: var(--color-text-muted);
      overflow-wrap: anywhere;
    }
    @media (width <= 48rem) {
      .wallet-panel {
        padding: var(--size-3);
      }
      .wallet-row {
        flex-direction: column;
        align-items: stretch;
      }
      select,
      button {
        inline-size: 100%;
      }
    }
  `;

  declare status: string;
  declare walletName: string;
  declare isConnecting: boolean;
  declare selectedWallet: string;
  declare did: string;
  declare sessionToken: string | null;
  declare isLoggedIn: boolean;
  declare profile: SovereignProfile | null;
  declare detectedWallets: string[];
  private _walletScanTimer: number | undefined;

  private readonly _handleConnectClick = () => {
    console.log("[WalletConnect] Direct button click fired");
    void this._connect(this.isLoggedIn && !!this.sessionToken);
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

  private readonly _handleLogoutClick = () => {
    void this.logout();
  };

  constructor() {
    super();
    this.status = "Disconnected";
    this.walletName = "";
    this.isConnecting = false;
    this.selectedWallet = "";
    this.did = "";
    this.sessionToken = null;
    this.isLoggedIn = false;
    this.profile = null;
    this.detectedWallets = [];
    console.log("[WalletConnect] Constructor called - component instantiating");
  }

  private _fromBase64(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  }

  private async _getDb(): Promise<IDBDatabase | null> {
    if (typeof window === "undefined") return null;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("sovereignlink-vault", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("profiles", { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    });
  }

  private async _getStoredWalletKey(): Promise<Uint8Array | null> {
    const db = await this._getDb();
    if (!db) return null;
    const record = await new Promise<ProfileRecord | undefined>((resolve, reject) => {
      const req = db.transaction("profiles", "readonly").objectStore("profiles").get("me");
      req.onsuccess = () => resolve(req.result as ProfileRecord | undefined);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
    });
    return record?.walletKeyB64 ? this._fromBase64(record.walletKeyB64) : null;
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

    void this.validateSession();
  }

  override firstUpdated() {
    const button = this.shadowRoot?.getElementById("connect-wallet-button");
    const select = this.shadowRoot?.getElementById("wallet-select");
    const refreshButton = this.shadowRoot?.getElementById("refresh-wallets-button");
    const logoutButton = this.shadowRoot?.getElementById("logout-button");

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

    if (logoutButton instanceof HTMLButtonElement) {
      logoutButton.addEventListener("click", this._handleLogoutClick);
      console.log("[WalletConnect] Attached click listener to logout button");
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

    void this.validateSession();
  }

  override disconnectedCallback() {
    const button = this.shadowRoot?.getElementById("connect-wallet-button");
    const select = this.shadowRoot?.getElementById("wallet-select");
    const refreshButton = this.shadowRoot?.getElementById("refresh-wallets-button");
    const logoutButton = this.shadowRoot?.getElementById("logout-button");

    if (button instanceof HTMLButtonElement) {
      button.removeEventListener("click", this._handleConnectClick);
    }

    if (select instanceof HTMLSelectElement) {
      select.removeEventListener("change", this._handleWalletChange);
    }

    if (refreshButton instanceof HTMLButtonElement) {
      refreshButton.removeEventListener("click", this._handleRefreshClick);
    }

    if (logoutButton instanceof HTMLButtonElement) {
      logoutButton.removeEventListener("click", this._handleLogoutClick);
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

  private async _connect(forceVerify = false) {
    console.log("[WalletConnect] _connect() called");
    if (!forceVerify && (await this.validateSession())) {
      this.status = "Logged in";
      return;
    }
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
      const api = (await provider.enable()) as Cip30EnabledApi;
      this.walletName = selected;

      if (typeof window === "undefined") {
        this.status = "Connected";
        return;
      }

      // Sovereignty: DID is derived client-side from wallet-controlled data, with no central authority.
      const walletSource =
        (typeof api.getPubKey === "function" && (await api.getPubKey())) ||
        (typeof api.getChangeAddress === "function" && (await api.getChangeAddress())) ||
        `${selected}-${Date.now()}`;
      const hashBytes = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(walletSource)),
      );
      const pubKeyHash = Array.from(hashBytes, (b) => b.toString(16).padStart(2, "0")).join("");
      const did = `did:midnight:${selected.toLowerCase()}-${pubKeyHash.slice(0, 16)}`;
      const defaultProfile: SovereignProfile = {
        did,
        alias: this.walletName || "Sovereign User",
        bio: "",
        avatarCid: "",
        createdAt: Date.now(),
      };

      const existingProfile = await loadProfile();
      const profileToPersist =
        existingProfile && existingProfile.did === did ? existingProfile : defaultProfile;

      // Privacy + zero-cost Tier 0: encrypted local profile/session, no transaction or funds required.
      await saveProfile({ ...profileToPersist, walletPublicKey: hashBytes });
      const profile = await loadProfile();
      this.did = did;
      this.profile = profile;
      await this.createSessionToken(this.did);
      this.isLoggedIn = true;
      this.status = "Connected";
      console.log("[WalletConnect] ✓ Connected to wallet:", selected);
      this.dispatchEvent(
        new CustomEvent("wallet-connected", {
          detail: { wallet: selected },
          bubbles: true,
          composed: true,
        }),
      );
      this.dispatchEvent(
        new CustomEvent("profile-ready", {
          detail: { did, profile },
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

  async createSessionToken(did: string): Promise<void> {
    if (typeof window === "undefined") return;
    const walletKey = await this._getStoredWalletKey();
    if (!walletKey) return;
    // Sovereignty: session token is client-side only, wallet-derived, and never sent to a server.
    // Privacy: encrypted with the same wallet-derived key as profile data; expires in 24h.
    const payload = { did, iat: Date.now(), exp: Date.now() + 24 * 60 * 60 * 1000 };
    const ciphertext = await encrypt(payload, walletKey);
    const db = await this._getDb();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("profiles", "readwrite");
      tx.objectStore("profiles").put({ id: "session", ciphertext } as SessionRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    });
    this.sessionToken = ciphertext;
  }

  async validateSession(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    const db = await this._getDb();
    if (!db) return false;
    const session = await new Promise<SessionRecord | undefined>((resolve, reject) => {
      const req = db.transaction("profiles", "readonly").objectStore("profiles").get("session");
      req.onsuccess = () => resolve(req.result as SessionRecord | undefined);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
    });
    if (!session?.ciphertext) return false;
    const walletKey = await this._getStoredWalletKey();
    if (!walletKey) return false;
    try {
      const payload = (await decrypt(session.ciphertext, walletKey)) as {
        did: string;
        exp: number;
      };
      if (payload.exp <= Date.now()) throw new Error("Session expired");
      const profile = await loadProfile();
      if (!profile) throw new Error("No profile for session");
      // Persistence: encrypted token survives reloads; wallet re-enable only needed after expiry/logout.
      this.sessionToken = session.ciphertext;
      this.did = payload.did;
      this.profile = profile;
      this.isLoggedIn = true;
      this.status = this.detectedWallets.length > 0 ? "Logged in" : "Reconnect to continue";
      return true;
    } catch {
      await this._clearSessionRecord();
      this.sessionToken = null;
      this.isLoggedIn = false;
      return false;
    }
  }

  private async _clearSessionRecord(): Promise<void> {
    const db = await this._getDb();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("profiles", "readwrite");
      tx.objectStore("profiles").delete("session");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    });
  }

  async logout(): Promise<void> {
    if (typeof window === "undefined") return;
    // Logout: clear session state only; encrypted sovereign profile remains local for next wallet login.
    await this._clearSessionRecord();
    this.did = "";
    this.profile = null;
    this.sessionToken = null;
    this.isLoggedIn = false;
    this.walletName = "";
    this.status = "Disconnected";
    this.dispatchEvent(
      new CustomEvent("wallet-disconnected", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    console.log(
      "[WalletConnect] render() called - status:",
      this.status,
      "isConnecting:",
      this.isConnecting,
    );
    const wallets = this.detectedWallets;

    return html`
      <section class="wallet-panel">
        <div class="wallet-header">
          <p class="wallet-title">Wallet Status</p>
          <p class="wallet-status">${this.status}${this.walletName ? ` (${this.walletName})` : ""}</p>
        </div>

        <div class="wallet-controls">
          <label for="wallet-select">Wallet Provider</label>
          <div class="wallet-row">
            <select
              id="wallet-select"
              ?disabled=${this.isConnecting || wallets.length === 0 || this.isLoggedIn}
              .value=${this.selectedWallet}
            >
              ${
                wallets.length
                  ? wallets.map((wallet) => html`<option value=${wallet}>${wallet}</option>`)
                  : html`<option value="">No wallets detected</option>`
              }
            </select>

            <button
              class="primary"
              id="connect-wallet-button"
              ?hidden=${this.isLoggedIn}
              ?disabled=${this.isConnecting || wallets.length === 0 || this.isLoggedIn}
            >
              ${this.isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>

            <button id="refresh-wallets-button" type="button" ?disabled=${this.isConnecting}>
              Refresh
            </button>

            <button
              id="logout-button"
              type="button"
              ?hidden=${!this.isLoggedIn}
              ?disabled=${!this.isLoggedIn}
            >
              Logout
            </button>
          </div>
        </div>

        <p class="wallet-meta">DID: ${this.did || "Not derived yet"}</p>
        <p class="wallet-meta">Alias: ${this.profile?.alias || "No profile loaded"}</p>
      </section>
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
