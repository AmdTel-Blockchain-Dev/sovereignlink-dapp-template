import { LitElement, css, html } from "lit";
import { clearTemporaryIPFSCache, isTemporaryCID, resolveCID, uploadToIPFS } from "../lib/ipfs.ts";
import { loadProfile, saveProfile } from "../lib/storage.ts";

type SovereignProfileRecord = {
  did: string;
  alias: string;
  bio?: string;
  avatarCid?: string;
  ipfsCid?: string;
  createdAt: number;
};

type ProfileReadyEvent = CustomEvent<{ did: string; profile: SovereignProfileRecord | null }>;
type ProfileRecord = { id: "me"; walletKeyB64: string };

export class SovereignProfile extends LitElement {
  static properties = {
    profile: { state: true },
    isEditing: { type: Boolean },
    ipfsCid: { state: true },
    isUploading: { state: true },
    uploadError: { state: true },
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
    a { color: var(--blue-7); }
    .error { color: var(--red-7); font-size: var(--font-size-1); }
    .hint { color: var(--orange-7); font-size: var(--font-size-1); }
  `;

  declare profile: SovereignProfileRecord | null;
  declare isEditing: boolean;
  declare ipfsCid: string | null;
  declare isUploading: boolean;
  declare uploadError: string | null;
  private _walletKey: Uint8Array | null;

  private readonly _onProfileReady = (event: Event) => {
    const custom = event as ProfileReadyEvent;
    this.profile = custom.detail?.profile ?? null;
    this._walletKey = null;
    void this.loadProfileFromStorage();
  };

  private readonly _onWalletDisconnected = () => {
    clearTemporaryIPFSCache();
    this.profile = null;
    this.isEditing = false;
    this._walletKey = null;
  };

  constructor() {
    super();
    this.profile = null;
    this.isEditing = false;
    this.ipfsCid = null;
    this.isUploading = false;
    this.uploadError = null;
    this._walletKey = null;
  }

  override updated(changed: Map<string, unknown>): void {
    if (changed.has("profile")) {
      this.ipfsCid = this.profile?.ipfsCid ?? null;
    }
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

  async shareViaIpfs(): Promise<void> {
    if (typeof window === "undefined" || !this.profile || this.isUploading) return;
    this.isUploading = true;
    this.uploadError = null;
    try {
      const payload = {
        did: this.profile.did,
        alias: this.profile.alias,
        bio: this.profile.bio || "No bio yet",
        sharedAt: Date.now(),
      };
      const cid = await uploadToIPFS(payload);
      this.profile = { ...this.profile, ipfsCid: cid };
      await this.saveProfileToStorage();
      await this.loadProfileFromStorage();
    } catch (error) {
      this.uploadError = error instanceof Error ? error.message : "IPFS upload failed";
    } finally {
      this.isUploading = false;
    }
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
      return html`
        <article>
          <p class="value">Connect wallet to create sovereign profile</p>
          <div class="field">
            <span class="label">IPFS CID</span>
            <p class="value">IPFS CID: none</p>
          </div>
          <div class="actions">
            <button type="button" disabled>Share via IPFS</button>
          </div>
        </article>
      `;
    }
    const created = new Date(this.profile.createdAt).toLocaleString();
    const ipfsLink = this.ipfsCid ? resolveCID(this.ipfsCid) : "";
    const usingTemporaryCid = this.ipfsCid ? isTemporaryCID(this.ipfsCid) : false;
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
          ${
            this.isEditing
              ? html`<input name="alias" .value=${this.profile.alias} @input=${this.handleInputChange} />`
              : html`<p class="value">${this.profile.alias || "Sovereign User"}</p>`
          }
        </div>
        <div class="field">
          <span class="label">Bio</span>
          ${
            this.isEditing
              ? html`<textarea name="bio" .value=${this.profile.bio ?? ""} @input=${this.handleInputChange}></textarea>`
              : html`<p class="value">${this.profile.bio || "No bio yet"}</p>`
          }
        </div>
        <div class="field">
          <span class="label">Created</span>
          <p class="value">${created}</p>
        </div>
        <div class="field">
          <span class="label">IPFS CID</span>
          <p class="value">IPFS CID: ${this.ipfsCid || "none"}</p>
        </div>
        ${
          this.ipfsCid
            ? html`
              <div class="field">
                <span class="label">Public Gateway</span>
                <a href=${ipfsLink} target="_blank" rel="noreferrer">
                  ${usingTemporaryCid ? "View encrypted session payload" : "View on IPFS"}
                </a>
              </div>
            `
            : html``
        }
        ${
          usingTemporaryCid
            ? html`<p class="hint">Temporary session fallback active: CID is local-only until logout/close.</p>`
            : html``
        }
        ${this.uploadError ? html`<p class="error">${this.uploadError}</p>` : html``}
        <div class="actions">
          <button type="button" @click=${this.toggleEdit}>${this.isEditing ? "Save" : "Edit"}</button>
          <button type="button" ?disabled=${this.isUploading} @click=${this.shareViaIpfs}>
            ${this.isUploading ? "Uploading..." : "Share via IPFS"}
          </button>
          <!-- Phase 2 bridge: clicking this will initialise user-vault.compact on Midnight.
               ZK-protected shielded storage replaces Tier 0 local vault.
               Requires a small NIGHT balance to submit the storePrivateData() circuit tx. -->
          <button
            type="button"
            @click=${() => {
              // TODO: Phase 2 – Initialise Midnight user-vault.compact with this DID
              // eslint-disable-next-line no-console
              console.log(
                "TODO: Phase 2 – Initialise Midnight user-vault.compact with this DID",
                this.profile?.did,
              );
            }}
          >Upgrade to Private Vault</button>
          <p class="hint">Requires small NIGHT balance for shielded storage (Phase 2).</p>
        </div>
      </article>
    `;
  }
}

if (!customElements.get("sovereign-profile")) {
  customElements.define("sovereign-profile", SovereignProfile);
}
