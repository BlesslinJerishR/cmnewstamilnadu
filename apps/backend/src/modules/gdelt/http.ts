import { Agent, fetch as undiciFetch } from 'undici';

/**
 * HTTP client for GDELT only. GDELT can take well over 10 seconds to accept a TCP connection
 * while it is throttling a client, which exceeds the default fetch connect timeout; a dedicated
 * agent with longer timeouts and a small connection pool is used instead.
 */
const agent = new Agent({
  connect: { timeout: 30_000 },
  headersTimeout: 120_000,
  bodyTimeout: 120_000,
  connections: 4,
  keepAliveTimeout: 10_000,
});

export function gdeltFetch(url: string, init: { headers?: Record<string, string>; signal?: AbortSignal } = {}) {
  return undiciFetch(url, { ...init, dispatcher: agent, redirect: 'follow' });
}
