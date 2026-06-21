// sealClient.ts — construct the Seal + Sui clients used to decrypt a job result. Modeled on
// data/src/config.ts and agent/app/src/jobs/jobResult.ts: open-mode key servers, verifyKeyServers
// off (testnet open servers), threshold from config. A FRESH SealClient is built per decrypt to
// avoid the per-id key cache giving a false "pass" on a repeat decrypt (memory: seal key cache).

import { SealClient, type SealCompatibleClient } from "@mysten/seal";

import type { CliConfig } from "../config/config.js";
import { buildSuiClient } from "./suiClient.js";

export interface SealBundle {
  readonly sui: SealCompatibleClient;
  readonly seal: SealClient;
}

/** Build a fresh { sui, seal } bundle for a single decrypt operation. */
export function buildSealClient(config: CliConfig): SealBundle {
  const sui = buildSuiClient(config) as unknown as SealCompatibleClient;
  const seal = new SealClient({
    suiClient: sui,
    serverConfigs: config.sealKeyServerIds.map((objectId) => ({ objectId, weight: 1 })),
    verifyKeyServers: false,
  });
  return { sui, seal };
}
