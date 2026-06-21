// sealClient.ts — construct the Seal + Sui clients used to decrypt a job result. A FRESH SealClient
// is built per decrypt to avoid the per-id key cache giving a false "pass" on a repeat decrypt
// (memory: seal key cache). The key servers default to config, but the decrypt path derives them
// from the ciphertext (the committee the agent actually sealed under) and passes them here.

import { SealClient, type SealCompatibleClient } from "@mysten/seal";

import type { CliConfig } from "../config/config.js";
import { buildSuiClient } from "./suiClient.js";

export interface SealBundle {
  readonly sui: SealCompatibleClient;
  readonly seal: SealClient;
}

/** Build a fresh { sui, seal } bundle for a single decrypt over the given key servers. */
export function buildSealClient(config: CliConfig, serverIds?: readonly string[]): SealBundle {
  const ids = serverIds && serverIds.length > 0 ? serverIds : config.sealKeyServerIds;
  const sui = buildSuiClient(config) as unknown as SealCompatibleClient;
  const seal = new SealClient({
    suiClient: sui,
    serverConfigs: ids.map((objectId) => ({ objectId, weight: 1 })),
    verifyKeyServers: false,
  });
  return { sui, seal };
}
