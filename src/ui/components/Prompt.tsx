// Prompt.tsx — the single bottom input. Shows a colored label and an input (masked when asking for
// a secret). While the console is busy it is replaced by a spinner. Resets via the inputKey prop.

import { Box, Text } from "ink";
import { Spinner, TextInput, PasswordInput } from "@inkjs/ui";

export function Prompt({
  label,
  mask = false,
  busy,
  inputKey,
  onSubmit,
}: {
  label: string;
  mask?: boolean;
  busy?: string;
  inputKey: number;
  onSubmit: (value: string) => void;
}) {
  if (busy) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Spinner label={busy} />
      </Box>
    );
  }
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="yellow" bold>
        {label} ▸{" "}
      </Text>
      {mask ? (
        <PasswordInput key={inputKey} placeholder="" onSubmit={onSubmit} />
      ) : (
        <TextInput key={inputKey} placeholder="" onSubmit={onSubmit} />
      )}
    </Box>
  );
}
