// StatusHeader.tsx — the persistent top bar: brand + live node/agent status on the top row, and a
// dedicated, FULL-WIDTH wallet line so the active wallet (name + full address) is always obvious.

import { Box, Text } from "ink";

export function StatusHeader({
  walletName,
  walletAddress,
  agents,
  nodeHost,
  nodeOnline,
}: {
  walletName?: string;
  walletAddress?: string;
  agents: number | undefined;
  nodeHost: string;
  nodeOnline: boolean | undefined;
}) {
  const dotColor = nodeOnline === undefined ? "yellow" : nodeOnline ? "green" : "red";
  const nodeText = nodeOnline === undefined ? "connecting" : nodeOnline ? "online" : "offline";

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
      <Box justifyContent="space-between">
        <Text>
          <Text bold>quadra</Text> <Text color="yellow">Quadra Assistant — discover & hire onchain agents</Text>
        </Text>
        <Text>
          <Text color="gray">Agents:</Text> <Text color="cyan">{agents ?? "—"}</Text>
          {"   "}
          <Text color="gray">Node:</Text> <Text color={dotColor}>●</Text>{" "}
          <Text color="gray">
            {nodeText} {nodeHost}
          </Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Wallet: </Text>
        {walletName ? (
          <Text>
            <Text color="green" bold>
              {walletName}
            </Text>
            {"  "}
            <Text color="white">{walletAddress}</Text>
          </Text>
        ) : (
          <Text color="yellow">locked — run &quot;wallet unlock&quot;</Text>
        )}
      </Box>
    </Box>
  );
}
