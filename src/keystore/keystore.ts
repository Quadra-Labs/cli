// keystore.ts — KeystoreManager: the lifecycle of named, encrypted wallets on disk. Create
// generates a fresh Ed25519 keypair and seals its bech32 secret; import validates an existing
// secret before persisting; unlock re-derives the in-memory Signer. The plaintext secret only
// exists transiently inside create/import/unlock and is never written back or logged.
//
// Wallets may be saved WITHOUT a password for zero-friction reuse: those are sealed under a fixed
// app key (INTERNAL_PASSPHRASE) so they auto-unlock on launch. That is convenience, NOT security —
// a no-password wallet can be opened by anyone with read access to the keystore file. Use it only
// on a machine you trust; prefer a password otherwise. The keystore also tracks a default wallet
// (the last created/imported/unlocked) so the app can auto-load it at startup.

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { normalizeWalrusSigner } from "../wallet/walrusSigner.js";
import { open, seal } from "./crypto.js";
import { loadKeystoreFile, saveKeystoreFile } from "./keystoreFile.js";
import type {
  KeystoreFileV1,
  UnlockedWallet,
  WalletEntry,
  WalletSummary,
} from "./keystoreTypes.js";

// Fixed key used to seal no-password wallets. It only obfuscates the on-disk bytes (so the file is
// uniform and the bech32 key is never grep-able); it is NOT a secret and provides no real
// protection. Anyone with this open-source constant and the file can recover a no-password wallet.
const INTERNAL_PASSPHRASE = "quadra-cli::no-password::v1";

export type CreateResult =
  | { ok: true; wallet: UnlockedWallet }
  | { ok: false; reason: string };

export type ImportResult =
  | { ok: true; summary: WalletSummary }
  | { ok: false; reason: string };

export type UnlockResult =
  | { ok: true; wallet: UnlockedWallet }
  | { ok: false; reason: string };

function isProtectedEntry(entry: WalletEntry): boolean {
  // Older entries (no flag) are protected; only an explicit false means no-password.
  return entry.protected !== false;
}

export class KeystoreManager {
  readonly #dir: string;

  constructor(keystoreDir: string) {
    this.#dir = keystoreDir;
  }

  /** List stored wallets (public summaries only; no password needed). */
  list(): WalletSummary[] {
    const file = loadKeystoreFile(this.#dir);
    return Object.entries(file.wallets)
      .map(([name, entry]) => ({
        name,
        address: entry.address,
        createdAt: entry.createdAt,
        protected: isProtectedEntry(entry),
      }))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /** True if a wallet with this name already exists. */
  has(name: string): boolean {
    const file = loadKeystoreFile(this.#dir);
    return Object.prototype.hasOwnProperty.call(file.wallets, name);
  }

  /** Whether a stored wallet needs a password to unlock. */
  isProtected(name: string): boolean {
    const entry = loadKeystoreFile(this.#dir).wallets[name];
    return entry ? isProtectedEntry(entry) : true;
  }

  /** The wallet to auto-load at startup, if it still exists. */
  getDefault(): string | undefined {
    const file = loadKeystoreFile(this.#dir);
    const name = file.defaultWallet;
    return name && file.wallets[name] ? name : undefined;
  }

  /** Mark a wallet as the default to auto-load next launch. */
  setDefault(name: string): void {
    const file = loadKeystoreFile(this.#dir);
    if (!file.wallets[name]) return;
    saveKeystoreFile(this.#dir, { ...file, defaultWallet: name });
  }

  /**
   * Create a brand-new wallet. An empty/undefined password stores it WITHOUT protection (it will
   * auto-unlock on launch); a non-empty password seals it under that password.
   */
  create(name: string, password?: string): CreateResult {
    const nameError = validateName(name);
    if (nameError) return { ok: false, reason: nameError };
    if (this.has(name)) return { ok: false, reason: `a wallet named "${name}" already exists` };

    const keypair = Ed25519Keypair.generate();
    const secret = keypair.getSecretKey(); // bech32 suiprivkey...
    const address = keypair.toSuiAddress();
    this.#persist(name, secret, address, password);
    return { ok: true, wallet: { name, address, signer: keypair } };
  }

  /**
   * Import an existing secret (bech32 or base64 seed), validating it before persisting. An empty/
   * undefined password stores it without protection.
   */
  import(name: string, secret: string, password?: string): ImportResult {
    const nameError = validateName(name);
    if (nameError) return { ok: false, reason: nameError };
    if (this.has(name)) return { ok: false, reason: `a wallet named "${name}" already exists` };

    const normalized = normalizeWalrusSigner(secret);
    if (!normalized.ok) return { ok: false, reason: normalized.reason };
    const signer = normalized.signer;
    const address = signer.toSuiAddress();
    const canonical = (signer as Ed25519Keypair).getSecretKey();
    this.#persist(name, canonical, address, password);
    return {
      ok: true,
      summary: { name, address, createdAt: Date.now(), protected: (password ?? "").length > 0 },
    };
  }

  /**
   * Unlock a wallet into an in-memory Signer. No-password wallets unlock with no password; the
   * unlocked wallet becomes the default for next launch. Wrong password -> ok:false.
   */
  unlock(name: string, password?: string): UnlockResult {
    const file = loadKeystoreFile(this.#dir);
    const entry = file.wallets[name];
    if (!entry) return { ok: false, reason: `no wallet named "${name}"` };
    const effective = isProtectedEntry(entry) ? (password ?? "") : INTERNAL_PASSPHRASE;
    let secret: string;
    try {
      secret = open(
        { kdfParams: entry.kdfParams, ivB64: entry.ivB64, ctB64: entry.ctB64, tagB64: entry.tagB64 },
        effective,
      );
    } catch {
      return { ok: false, reason: "incorrect password" };
    }
    const normalized = normalizeWalrusSigner(secret);
    if (!normalized.ok) return { ok: false, reason: "stored key could not be decoded" };
    this.setDefault(name);
    return { ok: true, wallet: { name, address: entry.address, signer: normalized.signer } };
  }

  /** Remove a wallet from the keystore. Returns true if one was removed. */
  remove(name: string): boolean {
    const file = loadKeystoreFile(this.#dir);
    if (!file.wallets[name]) return false;
    const { [name]: _removed, ...rest } = file.wallets;
    const next: KeystoreFileV1 = {
      version: 1,
      wallets: rest,
      ...(file.defaultWallet && file.defaultWallet !== name ? { defaultWallet: file.defaultWallet } : {}),
    };
    saveKeystoreFile(this.#dir, next);
    return true;
  }

  // Seal `secret` under the password (or the fixed app key when there is none), write the entry,
  // and make it the default to auto-load. Loads + rewrites the whole file (small, atomic).
  #persist(name: string, secret: string, address: string, password?: string): void {
    const isProtected = (password ?? "").length > 0;
    const sealed = seal(secret, isProtected ? password! : INTERNAL_PASSPHRASE);
    const entry: WalletEntry = {
      address,
      kdf: "scrypt",
      kdfParams: sealed.kdfParams,
      cipher: "aes-256-gcm",
      ivB64: sealed.ivB64,
      ctB64: sealed.ctB64,
      tagB64: sealed.tagB64,
      createdAt: Date.now(),
      protected: isProtected,
    };
    const file = loadKeystoreFile(this.#dir);
    const next: KeystoreFileV1 = {
      version: 1,
      wallets: { ...file.wallets, [name]: entry },
      defaultWallet: name,
    };
    saveKeystoreFile(this.#dir, next);
  }
}

// A wallet name is a single non-empty path-safe token (used only as a JSON key + display).
function validateName(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "name must not be empty";
  if (!/^[A-Za-z0-9 _.-]{1,40}$/.test(trimmed)) {
    return "name may use letters, numbers, spaces, and _.- (max 40 chars)";
  }
  return undefined;
}
