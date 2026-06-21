// resultPoll.ts — after payment, wait for the agent to deliver: poll GET /job-results/:jobId
// until the sealed envelope exists, then decrypt it with the user's wallet. "No result indexed"
// means the agent has not delivered yet (keep waiting). The poll is bounded (~46 min, mirroring
// the agent host's deliveryPoll deadline); beyond that the job is still paid and the agent host's
// own poller continues, so we exit with a "check back later" message rather than failing hard.

import type { Signer } from "@mysten/sui/cryptography";

import type { CliConfig } from "../config/config.js";
import { fetchJobResultBlob } from "./gatewayClient.js";
import { decryptJobResult } from "./resultDecrypt.js";
import type { JobResult } from "./gatewayTypes.js";

export type PollPhase = "waiting" | "decrypting";

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 46 * 60 * 1_000;

export interface ResultPollHandle {
  cancel(): void;
}

export interface ResultPollCallbacks {
  /** Called on each poll tick so the UI can show progress. */
  onPhase(phase: PollPhase, elapsedMs: number): void;
  onDone(result: JobResult): void;
  /** Terminal failure or timeout. `timedOut` distinguishes "still processing" from a real error. */
  onError(reason: string, timedOut: boolean): void;
}

/**
 * Start polling for a delivered result. Returns a handle whose cancel() stops the loop (e.g. when
 * the user leaves the screen). NEVER throws — all outcomes go through the callbacks.
 */
export function startResultPoll(
  input: { config: CliConfig; jobId: string; signer: Signer } & ResultPollCallbacks,
): ResultPollHandle {
  const startedAt = Date.now();
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = (): void => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };

  const tick = async (): Promise<void> => {
    if (cancelled) return;
    const elapsed = Date.now() - startedAt;
    if (elapsed > MAX_WAIT_MS) {
      input.onError("still processing — check back later with this job id", true);
      return;
    }

    input.onPhase("waiting", elapsed);
    const blob = await fetchJobResultBlob(input.config, input.jobId);
    if (cancelled) return;

    if (blob.ok) {
      input.onPhase("decrypting", Date.now() - startedAt);
      const decrypted = await decryptJobResult(blob.blob, input.signer, input.config);
      if (cancelled) return;
      if (decrypted.ok) input.onDone(decrypted.result);
      else input.onError(decrypted.reason, false);
      return;
    }

    if (blob.kind === "error") {
      input.onError(blob.message, false);
      return;
    }

    // not_ready -> wait and poll again.
    timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
  };

  void tick();
  return { cancel: stop };
}
