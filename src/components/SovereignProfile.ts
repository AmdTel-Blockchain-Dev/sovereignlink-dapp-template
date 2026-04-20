import { LitElement, css, html } from "lit";
import { loadProfile, saveProfile } from "../lib/storage.ts";

type SovereignProfileRecord = {
  did: string;
  alias: string;
  bio?: string;
  avatarCid?: string;
  createdAt: number;
};

type ProfileReadyEvent = CustomEvent<{ did: string; profile: SovereignProfileRecord | null }>;
type ProfileRecord = { id: "me"; walletKeyB64: string };

export class SovereignProfile extends LitElement {
  static properties = {
    profile: { state: true },
    isEditing: { type: Boolean },
  };

  static override styles = css`
    :host { display: block; }
    article { border: var(--border-size-1) solid var(--gray-4); border-radius: var(--radius-3); background: var(--surface-1); padding: var(--size-5); display: grid; gap: var(--size-3); max-inline-size: var(--size-content-3); }
    h2 { margin: 0; font-size: var(--font-size-4); }
    .field { display: grid; gap: var(--size-1); }
    .label { font-size: var(--font-size-0); color: var(--gray-7); text-transform: uppercase; letter-spacing: var(--font-letterspacing-3); }
    .value { margin: 0; color: var(--gray-9); word-break: break-all; }
    input, textarea { font: inherit; color: var(--gray-9); border: var(--border-size-1) solid var(--gray-4); border-radius: var(--radius-2); padding: var(--size-2); background: var(--surface-1); }
    textarea { min-block-size: 6rem; resize: vertical; }
    .actions { display: flex; flex-wrap: wrap; gap: var(--size-2); }
    button { font: inherit; border-radius: var(--radius-2); border: var(--border-size-1) solid var(--gray-5); background: var(--surface-2); color: var(--gray-9); padding: var(--size-2) var(--size-3); }
    button:disabled { opacity: 0.65; cursor: not-allowed; }
  `;

  declare profile: SovereignProfileRecord | null;
  declare isEditing: boolean;
  private _walletKey: Uint8Array | null;

  private readonly _onProfileReady = (event: Event) => {
    const custom = event as ProfileReadyEvent;
    this.profile = custom.detail?.profile ?? null;
    this._walletKey = null;
    void this.loadProfileFromStorage();
  };

  private readonly _onWalletDisconnected = () => {
    this.profile = null;
    this.isEditing = false;
    this._walletKey = null;
  };

  constructor() {
    super();
    this.profile = null;
    this.isEditing = false;
    this._walletKey = null;
  }

  private _fromBase64(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  }

  private async _getStoredWalletKey(): Promise<Uint8Array | null> {
    if (typeof window === "undefined") return null;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("sovereignlink-vault", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("profiles", { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    });
    const record = await new Promise<ProfileRecord | undefined>((resolve, reject) => {
      const req = db.transaction("profiles", "readonly").objectStore("profiles").get("me");
      req.onsuccess = () => resolve(req.result as ProfileRecord | undefined);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
    });
    return record?.walletKeyB64 ? this._fromBase64(record.walletKeyB64) : null;
  }

  override firstUpdated() {
    if (typeof window === "undefined") return;
    window.addEventListener("profile-ready", this._onProfileReady);
    window.addEventListener("wallet-disconnected", this._onWalletDisconnected);
    void this.loadProfileFromStorage();
  }

  override disconnectedCallback(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("profile-ready", this._onProfileReady);
      window.removeEventListener("wallet-disconnected", this._onWalletDisconnected);
    }
    super.disconnectedCallback();
  }

  async loadProfileFromStorage(): Promise<void> {
    if (typeof window === "undefined") return;
    const loaded = await loadProfile();
    if (!loaded) return;
    this.profile = loaded;
  }

  async saveProfileToStorage(): Promise<void> {
    if (typeof window === "undefined" || !this.profile) return;
    if (!this._walletKey) {
      this._walletKey = await this._getStoredWalletKey();
      if (!this._walletKey) return;
    }
    // Public profile stored encrypted locally - DID derived client-side, no central authority.
    await saveProfile({ ...this.profile, walletPublicKey: this._walletKey });
  }

  toggleEdit(): void {
    if (!this.profile) return;
    if (this.isEditing) {
      void this.saveProfileToStorage();
    }
    this.isEditing = !this.isEditing;
  }

  handleInputChange(event: Event): void {
    if (!this.profile) return;
    const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    const key = target.name as "alias" | "bio";
    this.profile = { ...this.profile, [key]: target.value };
  }

  override render() {
    if (!this.profile) {
      return html`<article><p class="value">Connect wallet to create sovereign profile</p></article>`;
    }
    const created = new Date(this.profile.createdAt).toLocaleString();
    return html`
      <article>
        <h2>Sovereign Profile</h2>
        <p class="value">
          Public profile stored encrypted locally - DID derived client-side, no central authority.
        </p>
        <div class="field">
          <span class="label">DID</span>
          <p class="value">${this.profile.did}</p>
        </div>
        <div class="field">
          <span class="label">Alias</span>
          ${this.isEditing
            ? html`<input name="alias" .value=${this.profile.alias} @input=${this.handleInputChange} />`
            : html`<p class="value">${this.profile.alias || "Sovereign User"}</p>`}
        </div>
        <div class="field">
          <span class="label">Bio</span>
          ${this.isEditing
            ? html`<textarea name="bio" .value=${this.profile.bio ?? ""} @input=${this.handleInputChange}></textarea>`
            : html`<p class="value">${this.profile.bio || "No bio yet"}</p>`}
        </div>
        <div class="field">
          <span class="label">Created</span>
          <p class="value">${created}</p>
        </div>
        <div class="actions">
          <button type="button" @click=${this.toggleEdit}>${this.isEditing ? "Save" : "Edit"}</button>
          <button type="button" disabled>Upgrade to Private Vault</button>
        </div>
      </article>
    `;
  }
}

if (!customElements.get("sovereign-profile")) {
  customElements.define("sovereign-profile", SovereignProfile);
}
