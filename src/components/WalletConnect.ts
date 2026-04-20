import { LitElement, css, html } from "lit";
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

  private readonly _handleViewProfileClick = () => {
    console.log("[WalletConnect] Loaded sovereign profile:", this.profile);
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
    const viewProfileButton = this.shadowRoot?.getElementById("view-profile-button");
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

    if (viewProfileButton instanceof HTMLButtonElement) {
      viewProfileButton.addEventListener("click", this._handleViewProfileClick);
      console.log("[WalletConnect] Attached click listener to view profile button");
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
    const viewProfileButton = this.shadowRoot?.getElementById("view-profile-button");
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

    if (viewProfileButton instanceof HTMLButtonElement) {
      viewProfileButton.removeEventListener("click", this._handleViewProfileClick);
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
      const payload = (await decrypt(session.ciphertext, walletKey)) as { did: string; exp: number };
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
      <p>DID: ${this.did || "Not derived yet"}</p>
      <p>Alias: ${this.profile?.alias || "No profile loaded"}</p>
      ${this.isLoggedIn
        ? html`<p>Logged in as ${this.profile?.alias || "Sovereign User"} (${this.did})</p>`
        : null}
      <button id="view-profile-button" type="button" ?disabled=${!this.profile}>
        View Profile
      </button>
      <button id="logout-button" type="button" ?disabled=${!this.isLoggedIn}>
        Logout
      </button>
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
