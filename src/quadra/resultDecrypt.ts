// resultDecrypt.ts — user-side decryption of a sealed job result. Adapted from data/src/seal.ts
// `JobResults.decrypt`, minus the Walrus fetch (the CLI already has the sealed envelope from the
// gateway). The requester (the paying user's wallet) must be an allowed reader, which
// `job_access::seal_approve` enforces on chain. NEVER throws — failures are typed.
//
// Key-server selection is derived from the CIPHERTEXT, not from static config: the EncryptedObject
// records the exact committee + threshold the agent sealed under. Some testnet key servers are now
// V2 "Committee" servers the SDK cannot reach without an aggregatorUrl; since the threshold is small
// (usually 1), we drop any such server (using the SDK's own error to identify it) and decrypt via
// the reachable "Independent" servers. This keeps decryption working as the key-server set evolves.

import { Transaction } from "@mysten/sui/transactions";
import { SessionKey, EncryptedObject } from "@mysten/seal";
import type { Signer } from "@mysten/sui/cryptography";

import type { CliConfig } from "../config/config.js";
import { buildSealClient } from "./sealClient.js";
import type { JobResult, SealedResultBlob } from "./gatewayTypes.js";

// Backdate the SessionKey so a local clock slightly AHEAD of the Seal key servers does not make the
// key look future-dated ("Session key has expired"). Well within the key TTL.
const SESSION_KEY_BACKDATE_MS = 60_000;

const COMMITTEE_RE = /Committee server (0x[0-9a-fA-F]+) requires aggregatorUrl/;

export type DecryptResult =
  | { ok: true; result: JobResult }
  | { ok: false; reason: string };

/** Seal identity bytes for a job = the UTF-8 job id (matches job_access::seal_approve). */
function identityBytes(jobId: string): Uint8Array {
  return new TextEncoder().encode(jobId);
}

// Read the committee key-server object ids + threshold the blob was sealed under.
function committeeFromBlob(
  encrypted: Uint8Array,
  config: CliConfig,
): { servers: string[]; threshold: number } {
  try {
    const parsed = EncryptedObject.parse(encrypted) as {
      services: [string, number][];
      threshold: number;
    };
    const servers = parsed.services.map((s) => s[0]);
    if (servers.length > 0) return { servers, threshold: parsed.threshold };
  } catch {
    // Fall through to the configured default below.
  }
  return { servers: [...config.sealKeyServerIds], threshold: config.sealThreshold };
}

/**
 * Decrypt a sealed result envelope with the user's wallet. Derives the key servers from the
 * ciphertext, dropping any unreachable committee server, then decrypts via the rest.
 */
export async function decryptJobResult(
  envelope: SealedResultBlob,
  requester: Signer,
  config: CliConfig,
): Promise<DecryptResult> {
  let encrypted: Uint8Array;
  try {
    encrypted = Uint8Array.from(Buffer.from(envelope.enc, "base64"));
  } catch {
    return { ok: false, reason: "result envelope is not valid base64" };
  }

  const { servers, threshold } = committeeFromBlob(encrypted, config);
  let candidates = servers;

  // One attempt per committee server at most: each failure either drops one committee server and
  // retries, or is terminal.
  for (let attempt = 0; attempt <= servers.length; attempt++) {
    if (candidates.length < threshold) {
      return {
        ok: false,
        reason: `no reachable key servers for this result (need ${threshold})`,
      };
    }
    const outcome = await attemptDecrypt(encrypted, envelope.job_id, requester, config, candidates);
    if (outcome.ok) return { ok: true, result: outcome.result };

    const committee = COMMITTEE_RE.exec(outcome.reason);
    if (committee && committee[1]) {
      const bad = committee[1].toLowerCase();
      candidates = candidates.filter((id) => id.toLowerCase() !== bad);
      continue;
    }
    return { ok: false, reason: outcome.reason };
  }
  return { ok: false, reason: "could not resolve a reachable key server" };
}

// One decrypt attempt against a specific set of key servers. NEVER throws.
async function attemptDecrypt(
  encrypted: Uint8Array,
  jobId: string,
  requester: Signer,
  config: CliConfig,
  serverIds: string[],
): Promise<DecryptResult> {
  try {
    const { sui, seal } = buildSealClient(config, serverIds);

    const fresh = await SessionKey.create({
      address: requester.toSuiAddress(),
      packageId: config.quadraPackageId,
      ttlMin: 10,
      suiClient: sui,
    });
    const exported = fresh.export();
    const sessionKey = SessionKey.import(
      { ...exported, creationTimeMs: exported.creationTimeMs - SESSION_KEY_BACKDATE_MS },
      sui,
    );
    const { signature } = await requester.signPersonalMessage(sessionKey.getPersonalMessage());
    await sessionKey.setPersonalMessageSignature(signature);

    const tx = new Transaction();
    tx.moveCall({
      target: `${config.quadraPackageId}::job_access::seal_approve`,
      arguments: [
        tx.pure.vector("u8", Array.from(identityBytes(jobId))),
        tx.object(config.jobAccessRegistryId),
      ],
    });
    const txBytes = await tx.build({ client: sui, onlyTransactionKind: true });

    const data = await seal.decrypt({ data: encrypted, sessionKey, txBytes });
    return { ok: true, result: JSON.parse(new TextDecoder().decode(data)) as JobResult };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "decryption failed" };
  }
}
