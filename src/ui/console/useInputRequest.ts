// useInputRequest.ts — lets async command flows pause for inline input at the bottom prompt.
// `ask(kind, label)` returns a promise that resolves when the user submits; the console renders the
// pending request (masked for passwords) and calls `submit` to resolve it. This is what makes the
// REPL feel like a shell: linear flows like `const name = await ask("text", "wallet name")`.

import { useCallback, useRef, useState } from "react";

import type { AskKind, PendingAsk } from "./types.js";

export interface InputRequest {
  readonly pending: PendingAsk | undefined;
  readonly ask: (kind: AskKind, label: string) => Promise<string>;
  readonly submit: (value: string) => void;
}

export function useInputRequest(): InputRequest {
  const [pending, setPending] = useState<PendingAsk | undefined>(undefined);
  const resolverRef = useRef<((value: string) => void) | undefined>(undefined);

  const ask = useCallback(
    (kind: AskKind, label: string) =>
      new Promise<string>((resolve) => {
        resolverRef.current = resolve;
        setPending({ kind, label });
      }),
    [],
  );

  const submit = useCallback((value: string) => {
    const resolve = resolverRef.current;
    resolverRef.current = undefined;
    setPending(undefined);
    resolve?.(value);
  }, []);

  return { pending, ask, submit };
}
