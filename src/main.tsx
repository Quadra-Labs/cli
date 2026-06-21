#!/usr/bin/env -S npx tsx
// main.tsx — entry point. Runs boot side effects (loads .env, IPv4-first) and launches the console.
// There are no subcommands: users install with `npm i -g` and run `quadra`. Everything happens in
// the interactive app (type "help" inside).

import "./boot.js";

import { render } from "ink";
import chalk from "chalk";

import { App } from "./ui/App.js";

if (!process.stdout.isTTY) {
  process.stderr.write(chalk.yellow("Quadra Assistant needs an interactive terminal (TTY).\n"));
  process.exitCode = 1;
} else {
  const { waitUntilExit } = render(<App />);
  await waitUntilExit();
}
