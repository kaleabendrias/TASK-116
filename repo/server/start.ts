import 'fake-indexeddb/auto';
import type { Server } from 'node:http';
import { createApiServer } from './app.js';

export function createAndStartServer(port: number): Server {
  const server = createApiServer();
  server.listen(port, '0.0.0.0', () => {
    process.stdout.write(`[api] listening on http://0.0.0.0:${port}\n`);
  });
  return server;
}

/* c8 ignore next 3 */
if (!process.env.VITEST) {
  createAndStartServer(Number(process.env.API_PORT ?? 3001));
}
