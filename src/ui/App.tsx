// App.tsx — root: build the process services once and render the console.

import { useMemo } from "react";

import { createServices } from "../state/session.js";
import { Console } from "./Console.js";

export function App() {
  const services = useMemo(() => createServices(), []);
  return <Console services={services} />;
}
