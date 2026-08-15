export type HookEventKind =
  | "deploy.created" | "incident.created" | "maintenance.created"
  | "deploy.status_changed" | "deploy.status_undone" | "deploy.rolled_back";

export type HookEvent = {
  kind: HookEventKind;
  occurredAt: string;
  company: string;
  product: string;
  service: string;
  environment: string;
  actor?: string | null;
  data: Record<string, unknown>;
};

export type ConnectorResult = { ok: boolean; statusCode?: number; error?: string };

export interface Connector {
  type: string;
  send(event: HookEvent, config: Record<string, unknown>): Promise<ConnectorResult>;
}
