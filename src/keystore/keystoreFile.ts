// keystoreFile.ts — read/write the keystore.json document. The directory is created on first
// write with mode 0700 and the file with mode 0600 (best-effort on Windows). Writes are atomic
// (temp file + rename) so a crash mid-write cannot corrupt an existing keystore.

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import type { KeystoreFileV1 } from "./keystoreTypes.js";

const FILE_NAME = "keystore.json";

const EMPTY: KeystoreFileV1 = { version: 1, wallets: {} };

/** Absolute path to the keystore file inside the keystore dir. */
export function keystorePath(keystoreDir: string): string {
  return resolve(keystoreDir, FILE_NAME);
}

/** Load the keystore, returning an empty one if the file does not exist yet. */
export function loadKeystoreFile(keystoreDir: string): KeystoreFileV1 {
  const path = keystorePath(keystoreDir);
  if (!existsSync(path)) return EMPTY;
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as KeystoreFileV1;
  if (parsed.version !== 1 || typeof parsed.wallets !== "object" || parsed.wallets === null) {
    throw new Error(`keystore at ${path} is not a recognized v1 file`);
  }
  return parsed;
}

/** Persist the keystore atomically with restrictive permissions. */
export function saveKeystoreFile(keystoreDir: string, file: KeystoreFileV1): void {
  mkdirSync(keystoreDir, { recursive: true, mode: 0o700 });
  const path = keystorePath(keystoreDir);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
}
