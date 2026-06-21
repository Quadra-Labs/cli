// walletInfo.ts — read a wallet's spendable balances: SUI (gas) and QUADRA (job payment).
// SUI comes from getBalance; QUADRA is summed across all coin objects of the published
// `${pkg}::quadra::QUADRA` type. Returns base-unit bigints (formatting is the UI's job).

import type { CliConfig } from "../config/config.js";
import { buildSuiClient } from "../quadra/suiClient.js";

export interface WalletBalances {
  /** SUI balance in MIST (gas). */
  readonly suiMist: bigint;
  /** QUADRA balance in base units. */
  readonly quadraBase: bigint;
}

export type WalletBalancesResult =
  | { ok: true; balances: WalletBalances }
  | { ok: false; reason: string };

/** Fetch SUI + QUADRA balances for an address. NEVER throws. */
export async function getWalletBalances(
  address: string,
  config: CliConfig,
): Promise<WalletBalancesResult> {
  try {
    const client = buildSuiClient(config);
    const quadraType = `${config.quadraPackageId}::quadra::QUADRA`;

    const sui = await client.getBalance({ owner: address });

    let quadraBase = 0n;
    let cursor: string | null | undefined = undefined;
    // Page through every QUADRA coin object so a wallet with many coins reports a full total.
    do {
      const page = await client.getCoins({
        owner: address,
        coinType: quadraType,
        ...(cursor ? { cursor } : {}),
      });
      for (const coin of page.data) quadraBase += BigInt(coin.balance);
      cursor = page.hasNextPage ? page.nextCursor : null;
    } while (cursor);

    return {
      ok: true,
      balances: { suiMist: BigInt(sui.totalBalance), quadraBase },
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "balance read failed" };
  }
}
