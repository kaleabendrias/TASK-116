import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAndStartServer } from '../server/start';

let server: Server | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server!.close(e => e ? reject(e) : resolve())
    );
    server = null;
  }
});

describe('createAndStartServer', () => {
  it('starts an HTTP server and returns 401 with a structured body for unauthenticated requests', async () => {
    server = createAndStartServer(0);
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/api/trips`);
    expect(res.status).toBe(401);

    const body = await res.json() as { error: string };
    expect(typeof body.error).toBe('string');
    expect(body.error).toBe('Missing Bearer token');
  });

  it('writes a startup log line containing the port to stdout', async () => {
    const lines: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout.write as unknown as (s: unknown) => boolean) = (chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    };

    server = createAndStartServer(0);
    await new Promise<void>(resolve => server!.once('listening', resolve));
    process.stdout.write = origWrite;

    expect(lines.some(l => l.includes('[api] listening'))).toBe(true);
    expect(lines.some(l => l.includes('0.0.0.0'))).toBe(true);
  });

  it('GET /api/health returns 200 { ok: true } — used as Playwright readiness probe', async () => {
    server = createAndStartServer(0);
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('emits EADDRINUSE when the requested port is already occupied', async () => {
    // Bind a port so it cannot be reused
    const occupied = createAndStartServer(0);
    await new Promise<void>(resolve => occupied.once('listening', resolve));
    const { port } = occupied.address() as AddressInfo;

    // Attempt to start a second server on the same port
    const conflicting = createAndStartServer(port);
    const err = await new Promise<NodeJS.ErrnoException>(resolve =>
      conflicting.once('error', resolve as (err: Error) => void)
    );

    expect(err.code).toBe('EADDRINUSE');

    // Clean up both servers
    await new Promise<void>(resolve => occupied.close(() => resolve()));
    conflicting.close(() => {});
  });
});
