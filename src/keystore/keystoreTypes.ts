// keystoreTypes.ts — the on-disk encrypted keystore shapes and the in-memory unlocked
// wallet. The keystore stores ONLY sealed bytes plus a public address; the plaintext secret
// (a bech32 suiprivkey string) exists in memory only after unlock and is never written back.

import type { Signer } from "@mysten/sui/cryptography";

/** scrypt KDF parameters persisted alongside each wallet so it can be re-derived. */
export interface KdfParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly keyLen: number;
  /** Base64 random salt, fresh per encryption. */
  readonly saltB64: string;
}

/** One wallet's encrypted record. The address is public (shown without unlock). */
export interface WalletEntry {
  /** Sui address derived from the keypair; safe to display unencrypted. */
  readonly address: string;
  readonly kdf: "scrypt";
  readonly kdfParams: KdfParams;
  readonly cipher: "aes-256-gcm";
  /** Base64 12-byte GCM nonce, fresh per encryption. */
  readonly ivB64: string;
  /** Base64 ciphertext of the bech32 suiprivkey secret. */
  readonly ctB64: string;
  /** Base64 GCM auth tag. */
  readonly tagB64: string;
  /** Creation timestamp (epoch ms). */
  readonly createdAt: number;
  /**
   * Whether unlocking requires the user's password. When false the wallet is sealed under a
   * fixed app key and auto-unlocks (convenience over security — see keystore.ts). Absent on
   * older entries, which are treated as protected (true).
   */
  readonly protected?: boolean;
}

/** The keystore file: a versioned map of wallet name -> encrypted entry. */
export interface KeystoreFileV1 {
  readonly version: 1;
  readonly wallets: Record<string, WalletEntry>;
  /** The wallet to auto-load on launch (last created/imported/unlocked). */
  readonly defaultWallet?: string;
}

/** A public summary of a stored wallet (no secret material), for listing. */
export interface WalletSummary {
  readonly name: string;
  readonly address: string;
  readonly createdAt: number;
  /** False when the wallet auto-unlocks without a password. */
  readonly protected: boolean;
}

/** An unlocked wallet held only in the in-memory session. Never serialized. */
export interface UnlockedWallet {
  readonly name: string;
  readonly address: string;
  readonly signer: Signer;
}
