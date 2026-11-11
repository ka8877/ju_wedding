export class ConnectionError extends Error {}
export interface ConnectionConfig { url: string; key: string; legacyAnon: boolean; }
export function connectionConfig(
  env?: Record<string, string | undefined>,
  fallback?: { url?: string; key?: string },
): ConnectionConfig;
export function checkConnection(
  config: ConnectionConfig,
  fetcher?: (url: string, options: RequestInit) => Promise<Response>,
  log?: (message: string) => void,
): Promise<{ published: boolean; checks: number }>;
