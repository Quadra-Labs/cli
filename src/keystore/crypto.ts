// crypto.ts — password-based authenticated encryption for keystore secrets, node:crypto only.
// Key derivation: scrypt(password, salt) -> 32-byte key. Encryption: AES-256-GCM with a fresh
// 12-byte nonce; the GCM tag authenticates the ciphertext, so a wrong password fails the tag
// check rather than silently returning garbage. Plaintext and password bytes are never logged.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

import type { KdfParams } from "./keystoreTypes.js";

// scrypt cost: N=16384 (2^14) is the common interactive default — strong enough for a local
// keystore without a noticeable unlock delay. r/p/keyLen are standard.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;

/** Raised when decryption fails its auth check. Carries NO key/password material. */
export class WrongPasswordError extends Error {
  constructor() {
    super("incorrect password");
    this.name = "WrongPasswordError";
  }
}

/** The output of sealing a secret: everything needed to open it given the password. */
export interface SealedSecret {
  readonly kdfParams: KdfParams;
  readonly ivB64: string;
  readonly ctB64: string;
  readonly tagB64: string;
}

function deriveKey(password: string, salt: Buffer, params: KdfParams): Buffer {
  return scryptSync(password, salt, params.keyLen, {
    N: params.N,
    r: params.r,
    p: params.p,
    // scrypt needs a higher maxmem than the default for N=16384.
    maxmem: 64 * 1024 * 1024,
  });
}

/** Encrypt a plaintext secret under a password. Returns sealed parts (all base64). */
export function seal(plaintext: string, password: string): SealedSecret {
  const salt = randomBytes(SALT_LEN);
  const kdfParams: KdfParams = {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    keyLen: KEY_LEN,
    saltB64: salt.toString("base64"),
  };
  const key = deriveKey(password, salt, kdfParams);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    kdfParams,
    ivB64: iv.toString("base64"),
    ctB64: ct.toString("base64"),
    tagB64: tag.toString("base64"),
  };
}

/** Decrypt a sealed secret with a password. Throws WrongPasswordError on auth failure. */
export function open(sealed: SealedSecret, password: string): string {
  const salt = Buffer.from(sealed.kdfParams.saltB64, "base64");
  const key = deriveKey(password, salt, sealed.kdfParams);
  const iv = Buffer.from(sealed.ivB64, "base64");
  const ct = Buffer.from(sealed.ctB64, "base64");
  const tag = Buffer.from(sealed.tagB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    // A GCM tag mismatch (wrong password or tampered file) throws here; never echo material.
    throw new WrongPasswordError();
  }
}
