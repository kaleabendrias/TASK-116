import { describe, it, expect, vi, afterEach } from 'vitest';
import { tick } from 'svelte';
import { bootstrapFirstAdmin, login, logout } from '@application/services/authService';
import RouteGuard from '../src/ui/components/RouteGuard.svelte';

afterEach(() => {
  logout();
  document.body.innerHTML = '';
});

describe('RouteGuard — anonymous user', () => {
  it('shows "Access denied" for anonymous user on any route', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new RouteGuard({ target: host, props: { route: 'trips' } });
    await tick();
    expect(host.innerHTML).toContain('Access denied');
  });

  it('shows anonymous role in the denied message', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new RouteGuard({ target: host, props: { route: 'trips' } });
    await tick();
    expect(host.innerHTML).toContain('anonymous');
  });

  it('shows denied on home route when not authenticated', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new RouteGuard({ target: host, props: { route: 'home' } });
    await tick();
    expect(host.innerHTML).toContain('Access denied');
  });
});

describe('RouteGuard — administrator', () => {
  it('passes the guard for all routes', async () => {
    await bootstrapFirstAdmin('admin', 'Admin123!');
    await login('admin', 'Admin123!');

    const routes = ['trips', 'configuration', 'questions', 'messaging', 'wellness', 'review'] as const;
    for (const route of routes) {
      const host = document.createElement('div');
      document.body.appendChild(host);
      // render with a slot child to verify it's rendered
      new RouteGuard({
        target: host,
        props: { route },
        // Svelte 4 doesn't support slot injection in tests without a wrapper
      });
      await tick();
      expect(host.innerHTML).not.toContain('Access denied');
    }
  });
});

describe('RouteGuard — dispatcher', () => {
  it('grants access to trips', async () => {
    await bootstrapFirstAdmin('admin', 'Admin123!');
    await login('admin', 'Admin123!');
    logout();

    const { register } = await import('@application/services/authService');
    await register('disp1', 'Disp123!', 'dispatcher');
    await login('disp1', 'Disp123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new RouteGuard({ target: host, props: { route: 'trips' } });
    await tick();
    expect(host.innerHTML).not.toContain('Access denied');
  });

  it('denies access to configuration (admin-only)', async () => {
    await bootstrapFirstAdmin('admin2', 'Admin123!');
    await login('admin2', 'Admin123!');
    logout();

    const { register } = await import('@application/services/authService');
    await register('disp2', 'Disp123!', 'dispatcher');
    await login('disp2', 'Disp123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new RouteGuard({ target: host, props: { route: 'configuration' } });
    await tick();
    expect(host.innerHTML).toContain('Access denied');
  });
});

describe('RouteGuard — reviewer', () => {
  it('grants access to review route', async () => {
    await bootstrapFirstAdmin('admin3', 'Admin123!');
    await login('admin3', 'Admin123!');
    logout();

    const { register } = await import('@application/services/authService');
    await register('rev1', 'Rev123!', 'reviewer');
    await login('rev1', 'Rev123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new RouteGuard({ target: host, props: { route: 'review' } });
    await tick();
    expect(host.innerHTML).not.toContain('Access denied');
  });

  it('denies access to trips for reviewer', async () => {
    await bootstrapFirstAdmin('admin4', 'Admin123!');
    await login('admin4', 'Admin123!');
    logout();

    const { register } = await import('@application/services/authService');
    await register('rev2', 'Rev123!', 'reviewer');
    await login('rev2', 'Rev123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new RouteGuard({ target: host, props: { route: 'trips' } });
    await tick();
    expect(host.innerHTML).toContain('Access denied');
  });
});
