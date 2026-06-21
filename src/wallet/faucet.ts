// faucet.ts — request testnet/devnet SUI gas for a freshly created wallet. This mints ONLY SUI
// (for gas), never QUADRA — a new wallet still needs QUADRA from elsewhere before it can hire.
// Mainnet has no faucet. NEVER throws; rate limits and outages surface as a typed failure.

import { getFaucetHost, requestSuiFromFaucetV2 } from "@mysten/sui/faucet";

import type { CliConfig } from "../config/config.js";

export type FaucetResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Whether the configured network has a public faucet. */
export function faucetSupported(config: CliConfig): boolean {
  return config.network === "testnet" || config.network === "devnet" || config.network === "localnet";
}

/** Request SUI gas for `address` on the configured network. */
export async function requestGas(address: string, config: CliConfig): Promise<FaucetResult> {
  if (!faucetSupported(config)) {
    return { ok: false, reason: `no faucet for ${config.network}` };
  }
  try {
    const host = getFaucetHost(config.network as "testnet" | "devnet" | "localnet");
    await requestSuiFromFaucetV2({ host, recipient: address });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "faucet request failed" };
  }
}
