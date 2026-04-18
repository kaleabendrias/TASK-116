import type { Server } from 'node:http';
import { createApiServer } from '../server/app';

export interface TestServer {
  baseUrl: string;
  stop: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  const server: Server = createApiServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const stop = () => new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  return { baseUrl, stop };
}

export async function post(baseUrl: string, path: string, body: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

export async function get(baseUrl: string, path: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, { method: 'GET', headers });
}
