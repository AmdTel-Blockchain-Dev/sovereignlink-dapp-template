import { css, html, LitElement } from "lit";
import {
  getBackupStatus,
  getRestoreCandidates,
  syncProfileBackups,
  type BackupCandidate,
  type BackupStatus,
} from "../lib/backup.ts";
import { clearTemporaryIPFSCache, isTemporaryCID, resolveCID, uploadToIPFS } from "../lib/ipfs.ts";
import { buildStorePrivateDataTx, connectMidnightWallet, submitTx } from "../lib/mesh.ts";
import { loadProfile, saveProfile } from "../lib/storage.ts";

type SovereignProfileRecord = {
  did: string;
  alias: string;
  bio?: string;
  avatarCid?: string;
  ipfsCid?: string;
  vaultTier?: "local" | "shielded";
  lastCommitment?: string;
  lastUpgradeTx?: string;
  lastUpgradeStatus?: string;
  profileVersion?: number;
  updatedAt?: number;
  createdAt: number;
};

type ProfileReadyEvent = CustomEvent<{ did: string; profile: SovereignProfileRecord | null }>;
type WalletConnectedEvent = CustomEvent<{ wallet: string }>;
type ProfileRecord = { id: "me"; walletKeyB64: string };

export class SovereignProfile extends LitElement {
  static properties = {
    profile: { state: true },
    isEditing: { type: Boolean },
    ipfsCid: { state: true },
    isUploading: { state: true },
    uploadError: { state: true },
    isUpgradingVault: { state: true },
    vaultStatus: { state: true },
    isSyncingBackups: { state: true },
    isRestoringBackup: { state: true },
    backupStatusText: { state: true },
    backupError: { state: true },
  };

  static override styles = css`
    :host {
      display: block;
    }
    article {
      border: var(--border-size-1) solid var(--color-border);
      border-radius: var(--radius-3);
      background: var(--surface-2);
      padding: var(--size-4);
      display: grid;
      gap: var(--size-3);
    }
    .title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--size-2);
    }
    h2 {
      margin: 0;
      font-size: var(--font-size-4);
    }
    .badge {
      border-radius: var(--radius-round);
      border: var(--border-size-1) solid var(--green-5);
      background: var(--green-0);
      color: var(--green-8);
      padding: var(--size-1) var(--size-2);
      font-size: var(--font-size-0);
      font-weight: var(--font-weight-6);
    }
    .field {
      display: grid;
      gap: var(--size-1);
    }
    .label {
      font-size: var(--font-size-0);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: var(--font-letterspacing-3);
    }
    .value {
      margin: 0;
      color: var(--color-text);
      word-break: break-word;
    }
    input,
    textarea {
      font: inherit;
      color: var(--color-text);
      border: var(--border-size-1) solid var(--color-border);
      border-radius: var(--radius-2);
      padding: var(--size-2);
      background: var(--surface-1);
    }
    textarea {
      min-block-size: 6rem;
      resize: vertical;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--size-2);
    }
    button {
      font: inherit;
      border-radius: var(--radius-2);
      border: var(--border-size-1) solid var(--color-border);
      background: var(--surface-1);
      color: var(--color-text);
      padding: var(--size-2) var(--size-3);
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
    a {
      color: var(--color-brand-strong);
    }
    .error {
      color: var(--red-7);
      font-size: var(--font-size-1);
    }
    .hint {
      color: var(--orange-7);
      font-size: var(--font-size-1);
    }
    @media (width <= 48rem) {
      article {
        padding: var(--size-3);
      }
      .actions {
        flex-direction: column;
      }
      .actions button {
        inline-size: 100%;
      }
    }
  `;

  declare profile: SovereignProfileRecord | null;
  declare isEditing: boolean;
  declare ipfsCid: string | null;
  declare isUploading: boolean;
  declare uploadError: string | null;
  declare isUpgradingVault: boolean;
  declare vaultStatus: string | null;
  declare isSyncingBackups: boolean;
  declare isRestoringBackup: boolean;
  declare backupStatusText: string | null;
  declare backupError: string | null;
  private _walletKey: Uint8Array | null;
  private _connectedWallet: string | null;

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
    this._connectedWallet = null;
    this.isUpgradingVault = false;
    this.vaultStatus = null;
  };

  private readonly _onWalletConnected = (event: Event) => {
    const custom = event as WalletConnectedEvent;
    this._connectedWallet = custom.detail?.wallet ?? null;
  };


  constructor() {
    super();
    this.profile = null;
    this.isEditing = false;
    this.ipfsCid = null;
    this.isUploading = false;
    this.uploadError = null;
    this.isUpgradingVault = false;
    this.vaultStatus = null;
    this.isSyncingBackups = false;
    this.isRestoringBackup = false;
    this.backupStatusText = null;
    this.backupError = null;
    this._walletKey = null;
    this._connectedWallet = null;
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
    window.addEventListener("wallet-connected", this._onWalletConnected);
    window.addEventListener("wallet-disconnected", this._onWalletDisconnected);
    void this.loadProfileFromStorage();
  }

  override disconnectedCallback(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("profile-ready", this._onProfileReady);
      window.removeEventListener("wallet-connected", this._onWalletConnected);
      window.removeEventListener("wallet-disconnected", this._onWalletDisconnected);
    }
    super.disconnectedCallback();
  }

  async loadProfileFromStorage(): Promise<void> {
    if (typeof window === "undefined") return;
    const loaded = await loadProfile();
    if (!loaded) return;
    this.profile = loaded;
    await this._refreshBackupStatus();
    this.dispatchEvent(
      new CustomEvent("sovereign-profile-updated", {
        detail: { profile: loaded },
        bubbles: true,
        composed: true,
      }),
    );
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
    const nextProfile: SovereignProfileRecord = {
      ...this.profile,
      profileVersion: (this.profile.profileVersion ?? 0) + 1,
      updatedAt: Date.now(),
    };
    this.profile = nextProfile;
    // Public profile stored encrypted locally - DID derived client-side, no central authority.
    await saveProfile({ ...nextProfile, walletPublicKey: this._walletKey });
    await this.syncBackups();
  }

  private _buildBackupStatusText(status: BackupStatus): string {
    const syncedAt = status.lastSyncedAt
      ? new Date(status.lastSyncedAt).toLocaleTimeString()
      : "never";
    const sourceLabel = status.preferredSource === "ipfs" ? "IPFS" : "Local";
    const diverged = status.diverged ? "diverged" : "aligned";
    return `Backup source: ${sourceLabel} (${diverged}), last sync ${syncedAt}`;
  }

  private _emitBackupStatus(status: BackupStatus): void {
    this.dispatchEvent(
      new CustomEvent("backup-status-updated", {
        detail: { backup: status },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async _refreshBackupStatus(): Promise<void> {
    const status = await getBackupStatus();
    this.backupStatusText = this._buildBackupStatusText(status);
    this._emitBackupStatus(status);
  }

  async syncBackups(): Promise<void> {
    if (!this.profile || this.isSyncingBackups) return;
    this.isSyncingBackups = true;
    this.backupError = null;
    try {
      const result = await syncProfileBackups(this.profile);
      if (result.latestCid && this.profile.ipfsCid !== result.latestCid) {
        this.profile = { ...this.profile, ipfsCid: result.latestCid };
        if (this._walletKey) {
          await saveProfile({ ...this.profile, walletPublicKey: this._walletKey });
        }
      }
      this.backupStatusText = this._buildBackupStatusText(result.status);
      this._emitBackupStatus(result.status);
    } catch (error) {
      this.backupError = error instanceof Error ? error.message : "Backup sync failed";
    } finally {
      this.isSyncingBackups = false;
    }
  }

  private _selectRestoreCandidate(candidates: BackupCandidate[]): BackupCandidate | null {
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0] ?? null;
    const uniqueHashes = new Set(candidates.map((item) => item.metadata.ciphertextHash));
    if (uniqueHashes.size <= 1) {
      return candidates.find((item) => item.source === "ipfs") ?? candidates[0] ?? null;
    }
    if (typeof window === "undefined") return candidates[0] ?? null;
    const prompt = window.prompt(
      "Backup sources diverged. Type 'ipfs' to restore preferred backup or 'local' to restore local backup.",
      "ipfs",
    );
    if (!prompt) return null;
    const choice = prompt.trim().toLowerCase();
    if (choice === "ipfs") {
      return (
        candidates.find((item) => item.source === "ipfs") ||
        candidates.find((item) => item.source === "temporary") ||
        null
      );
    }
    if (choice === "local") {
      return candidates.find((item) => item.source === "local") ?? null;
    }
    return null;
  }

  async restoreFromBackup(): Promise<void> {
    if (!this.profile || this.isRestoringBackup) return;
    this.isRestoringBackup = true;
    this.backupError = null;
    try {
      const candidates = await getRestoreCandidates();
      const chosen = this._selectRestoreCandidate(candidates);
      if (!chosen) {
        this.backupError = "Restore cancelled or no valid backup source available";
        return;
      }
      this.profile = {
        ...chosen.profile,
        ipfsCid: chosen.metadata.cid ?? chosen.profile.ipfsCid,
      };
      await this.saveProfileToStorage();
      await this.loadProfileFromStorage();
    } catch (error) {
      this.backupError = error instanceof Error ? error.message : "Restore failed";
    } finally {
      this.isRestoringBackup = false;
    }
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

  async upgradeToPrivateVault(): Promise<void> {
    if (typeof window === "undefined" || !this.profile || this.isUpgradingVault) return;

    this.isUpgradingVault = true;
    this.vaultStatus = null;
    try {
      const session = await connectMidnightWallet(this._connectedWallet ?? undefined);
      const dataCommitment =
        this.profile.ipfsCid || `local-${this.profile.did}-${this.profile.createdAt}`;
      const tx = await buildStorePrivateDataTx(this.profile.did, dataCommitment);
      const txHash = await submitTx(tx);

      const statusMessage = `Shielded on ${session.environment}: ${txHash}`;
      this.profile = {
        ...this.profile,
        vaultTier: "shielded",
        lastCommitment: dataCommitment,
        lastUpgradeTx: txHash,
        lastUpgradeStatus: statusMessage,
      };
      await this.saveProfileToStorage();
      this.vaultStatus = statusMessage;
      this.dispatchEvent(
        new CustomEvent("sovereign-profile-updated", {
          detail: {
            profile: this.profile,
            lastCommitment: dataCommitment,
            txHash,
            status: statusMessage,
            environment: session.environment,
          },
          bubbles: true,
          composed: true,
        }),
      );

      // eslint-disable-next-line no-console
      console.log("Phase 2 private vault upgrade complete", {
        wallet: session.walletName,
        environment: session.environment,
        txHash,
        did: this.profile.did,
      });
    } catch (error) {
      this.vaultStatus = error instanceof Error ? error.message : "Private vault upgrade failed";
      // eslint-disable-next-line no-console
      console.error("Private vault upgrade failed", error);
    } finally {
      this.isUpgradingVault = false;
    }
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
    const isShielded = this.profile.vaultTier === "shielded";

    return html`
      <article>
        <div class="title-row">
          <h2>Sovereign Profile</h2>
          ${isShielded ? html`<span class="badge">Shielded on Midnight ✓</span>` : html``}
        </div>
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
          <span class="label">Vault Tier</span>
          <p class="value">${this.profile.vaultTier || "local"}</p>
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
        ${this.vaultStatus ? html`<p class="hint">${this.vaultStatus}</p>` : html``}
        ${this.backupStatusText ? html`<p class="hint">${this.backupStatusText}</p>` : html``}
        ${this.backupError ? html`<p class="error">${this.backupError}</p>` : html``}
        <div class="actions">
          <button type="button" @click=${this.toggleEdit}>${this.isEditing ? "Save" : "Edit"}</button>
          <button type="button" ?disabled=${this.isUploading} @click=${this.shareViaIpfs}>
            ${this.isUploading ? "Uploading..." : "Share via IPFS"}
          </button>
          <button type="button" ?disabled=${this.isSyncingBackups} @click=${this.syncBackups}>
            ${this.isSyncingBackups ? "Syncing..." : "Sync Now"}
          </button>
          <button type="button" ?disabled=${this.isRestoringBackup} @click=${this.restoreFromBackup}>
            ${this.isRestoringBackup ? "Restoring..." : "Restore from Backup"}
          </button>
          ${
            isShielded
              ? html``
              : html`
                <button
                  type="button"
                  ?disabled=${this.isUpgradingVault}
                  @click=${this.upgradeToPrivateVault}
                >
                  ${this.isUpgradingVault ? "Upgrading..." : "Upgrade to Private Vault"}
                </button>
              `
          }
          <button type="button" @click=${() => this.dispatchEvent(new CustomEvent("logout-requested", { bubbles: true, composed: true }))}>Logout</button>
          <p class="hint">Local devnet = zero cost. Testnet later with faucet tNIGHT.</p></p>
        </div>
      </article>
    `;
  }
}

if (!customElements.get("sovereign-profile")) {
  customElements.define("sovereign-profile", SovereignProfile);
}
