// StatusHeader.tsx — the persistent top bar, styled after the reference: a boxed brand mark on the
// left and live status on the right (wallet, agent count, and node health with a colored dot).

import { Box, Text } from "ink";

export function StatusHeader({
  version,
  walletLabel,
  agents,
  nodeHost,
  nodeOnline,
}: {
  version: string;
  walletLabel: string;
  agents: number | undefined;
  nodeHost: string;
  nodeOnline: boolean | undefined;
}) {
  const dotColor = nodeOnline === undefined ? "yellow" : nodeOnline ? "green" : "red";
  const nodeText = nodeOnline === undefined ? "connecting" : nodeOnline ? "online" : "offline";

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} justifyContent="space-between">
      <Box flexDirection="column">
        <Text>
          <Text bold>quadra</Text>
        </Text>
        <Text color="yellow">Quadra Assistant — discover & hire onchain agents</Text>
      </Box>
      <Box flexDirection="column" alignItems="flex-end">
        <Text>
          <Text color="gray">Wallet:</Text> {walletLabel} <Text color="gray">|</Text>{" "}
          <Text color="gray">Agents:</Text> <Text color="cyan">{agents ?? "—"}</Text>
        </Text>
        <Text>
          <Text color="gray">Node:</Text> <Text color={dotColor}>●</Text>{" "}
          <Text color="gray">
            {nodeText} {nodeHost}
          </Text>
        </Text>
      </Box>
    </Box>
  );
}
