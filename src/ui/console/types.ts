// types.ts — console output + input-request shapes.

/** One rendered line in the console body. */
export interface OutputLine {
  readonly id: string;
  readonly text: string;
  readonly color?: string;
  readonly dim?: boolean;
  readonly bold?: boolean;
}

/** A pending inline question the bottom prompt is collecting an answer for. */
export type AskKind = "text" | "password" | "confirm";

export interface PendingAsk {
  readonly kind: AskKind;
  readonly label: string;
}
