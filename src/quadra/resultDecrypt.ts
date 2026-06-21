// resultDecrypt.ts — user-side decryption of a sealed job result. Adapted from data/src/seal.ts
// `JobResults.decrypt` (lines 107-143), minus the Walrus fetch: the CLI already has the sealed
// envelope from the gateway. The requester (the paying user's wallet) must be an allowed reader,
// which `job_access::seal_approve` enforces on chain. NEVER throws — failures are typed.

import { Transaction } from "@mysten/sui/transactions";
import { SessionKey } from "@mysten/seal";
import type { Signer } from "@mysten/sui/cryptography";

import type { CliConfig } from "../config/config.js";
import { buildSealClient } from "./sealClient.js";
import type { JobResult, SealedResultBlob } from "./gatewayTypes.js";

// Backdate the SessionKey so a local clock slightly AHEAD of the Seal key servers does not make
// the key look future-dated ("Session key has expired"). Well within the key TTL.
const SESSION_KEY_BACKDATE_MS = 60_000;

export type DecryptResult =
  | { ok: true; result: JobResult }
  | { ok: false; reason: string };

/** Seal identity bytes for a job = the UTF-8 job id (matches job_access::seal_approve). */
function identityBytes(jobId: string): Uint8Array {
  return new TextEncoder().encode(jobId);
}

/**
 * Decrypt a sealed result envelope with the user's wallet. Builds a fresh Seal client, creates a
 * backdated SessionKey, signs its personal message, builds the seal_approve PTB, and decrypts.
 */
export async function decryptJobResult(
  envelope: SealedResultBlob,
  requester: Signer,
  config: CliConfig,
): Promise<DecryptResult> {
  try {
    const { sui, seal } = buildSealClient(config);
    const encrypted = Uint8Array.from(Buffer.from(envelope.enc, "base64"));

    const fresh = await SessionKey.create({
      address: requester.toSuiAddress(),
      packageId: config.quadraPackageId,
      ttlMin: 10,
      suiClient: sui,
    });
    // Re-import with a backdated creationTimeMs BEFORE signing (the signed personal message
    // embeds the creation time).
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
        tx.pure.vector("u8", Array.from(identityBytes(envelope.job_id))),
        tx.object(config.jobAccessRegistryId),
      ],
    });
    const txBytes = await tx.build({ client: sui, onlyTransactionKind: true });

    const data = await seal.decrypt({ data: encrypted, sessionKey, txBytes });
    const result = JSON.parse(new TextDecoder().decode(data)) as JobResult;
    return { ok: true, result };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "decryption failed" };
  }
}
