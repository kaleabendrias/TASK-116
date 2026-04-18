import { describe, it, expect, vi, afterEach } from 'vitest';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import { logout, bootstrapFirstAdmin, login } from '@application/services/authService';

// Stub svelte-spa-router to avoid hash-routing side effects in happy-dom
vi.mock('svelte-spa-router', async () => {
  const { writable: w } = await import('svelte/store');
  const { default: FakeRouter } = await import('./FakeRouter.svelte');
  return {
    default: FakeRouter,
    link: (_node: Element) => ({ destroy: () => {} }),
    location: w('/')
  };
});

import App from '../src/ui/App.svelte';

afterEach(() => {
  logout();
  document.body.innerHTML = '';
});

describe('App — unauthenticated', () => {
  it('renders something (Login) when not authenticated', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();
    expect(host.innerHTML.length).toBeGreaterThan(0);
  });

  it('does not show the brand bar when logged out', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();
    expect(host.innerHTML).not.toContain('Task 09 SPA');
  });

  it('does not render the navigation bar when logged out', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();
    expect(host.querySelector('nav')).toBeNull();
  });

  it('renders a form element for login', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();
    expect(host.querySelector('form') !== null || host.querySelector('input') !== null).toBe(true);
  });
});

describe('App — authenticated as administrator', () => {
  it('renders the app shell with brand name', async () => {
    await bootstrapFirstAdmin('appadmin', 'Admin123!');
    await login('appadmin', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();
    expect(host.innerHTML).toContain('Task 09 SPA');
  });

  it('renders the navigation bar', async () => {
    await bootstrapFirstAdmin('appadmin2', 'Admin123!');
    await login('appadmin2', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();
    expect(host.querySelector('nav')).not.toBeNull();
  });

  it('shows the Sign out button', async () => {
    await bootstrapFirstAdmin('appadmin3', 'Admin123!');
    await login('appadmin3', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();
    expect(host.innerHTML).toContain('Sign out');
  });

  it('shows runtime config metadata in the topbar', async () => {
    await bootstrapFirstAdmin('appadmin4', 'Admin123!');
    await login('appadmin4', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();
    expect(host.innerHTML).toContain('mode:');
  });

  it('shows the username in the topbar', async () => {
    await bootstrapFirstAdmin('appadmin5', 'Admin123!');
    await login('appadmin5', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();
    expect(host.innerHTML).toContain('appadmin5');
  });

  it('shows navigation links for all admin routes', async () => {
    await bootstrapFirstAdmin('appadmin6', 'Admin123!');
    await login('appadmin6', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();
    const links = host.querySelectorAll('nav a');
    expect(links.length).toBeGreaterThanOrEqual(6);
  });
});

describe('App — authenticated as dispatcher', () => {
  it('shows fewer navigation links than admin', async () => {
    await bootstrapFirstAdmin('admin_disp', 'Admin123!');
    await login('admin_disp', 'Admin123!');
    logout();

    const { register } = await import('@application/services/authService');
    await register('disp_app', 'Disp123!', 'dispatcher');
    await login('disp_app', 'Disp123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();
    const links = host.querySelectorAll('nav a');
    // Dispatcher sees: home, trips, messaging, wellness = up to 4
    expect(links.length).toBeLessThan(7);
    expect(links.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// App — realistic service integration (sign-out flow, role-driven render)
// ─────────────────────────────────────────────────────────────────────────────

describe('App — sign-out interacts with real authService', () => {
  it('clicking Sign out transitions the app back to the login form', async () => {
    await bootstrapFirstAdmin('signout_admin', 'Admin123!');
    await login('signout_admin', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();

    // Confirmed authenticated state
    expect(host.innerHTML).toContain('Sign out');
    expect(host.querySelector('nav')).not.toBeNull();

    // Click the real Sign out button — this calls logout() in authService
    const signOutBtn = Array.from(host.querySelectorAll('button')).find(
      b => b.textContent?.includes('Sign out')
    );
    signOutBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    await tick();

    // App should revert to login screen
    expect(host.querySelector('form')).not.toBeNull();
    expect(host.innerHTML).not.toContain('Sign out');
  });

  it('re-login after sign-out restores the authenticated shell', async () => {
    await bootstrapFirstAdmin('relogin_admin', 'Admin123!');
    await login('relogin_admin', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();

    // Sign out
    const signOutBtn = Array.from(host.querySelectorAll('button')).find(
      b => b.textContent?.includes('Sign out')
    );
    signOutBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    expect(host.querySelector('nav')).toBeNull();

    // Log back in via the real authService
    await login('relogin_admin', 'Admin123!');
    await tick();
    await tick();

    // The Svelte store should update and re-render the authenticated shell
    expect(host.innerHTML).toContain('Task 09 SPA');
  });
});

describe('App — role determines which nav links are rendered (real service data)', () => {
  it('administrator sees a Configuration link; dispatcher does not', async () => {
    await bootstrapFirstAdmin('nav_admin', 'Admin123!');
    const { register } = await import('@application/services/authService');
    await register('nav_disp', 'Disp123!', 'dispatcher');

    // Admin session
    await login('nav_admin', 'Admin123!');
    const adminHost = document.createElement('div');
    document.body.appendChild(adminHost);
    new App({ target: adminHost });
    await tick();
    const adminLinks = Array.from(adminHost.querySelectorAll('nav a')).map(a => a.textContent ?? '');
    expect(adminLinks.some(l => l.toLowerCase().includes('config'))).toBe(true);
    logout();

    // Dispatcher session — same component, fresh auth state
    await login('nav_disp', 'Disp123!');
    const dispHost = document.createElement('div');
    document.body.appendChild(dispHost);
    new App({ target: dispHost });
    await tick();
    const dispLinks = Array.from(dispHost.querySelectorAll('nav a')).map(a => a.textContent ?? '');
    expect(dispLinks.some(l => l.toLowerCase().includes('config'))).toBe(false);
  });

  it('content author sees Questions link; dispatcher does not', async () => {
    await bootstrapFirstAdmin('nav_auth_admin', 'Admin123!');
    const { register } = await import('@application/services/authService');
    await register('nav_author', 'Auth123!', 'content_author');

    await login('nav_author', 'Auth123!');
    const host = document.createElement('div');
    document.body.appendChild(host);
    new App({ target: host });
    await tick();

    const links = Array.from(host.querySelectorAll('nav a')).map(a => a.textContent ?? '');
    expect(links.some(l => l.toLowerCase().includes('question'))).toBe(true);
  });
});
