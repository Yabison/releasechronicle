import type { Connector } from "./types";

const registry = new Map<string, Connector>();

export function register(c: Connector): void {
  registry.set(c.type, c);
}
export function getConnector(type: string): Connector | undefined {
  return registry.get(type);
}
