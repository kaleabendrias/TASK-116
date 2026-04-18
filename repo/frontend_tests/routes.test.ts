import { describe, it, expect, vi } from 'vitest';
import { tick } from 'svelte';

// Stub svelte-spa-router to prevent hash-routing side effects
vi.mock('svelte-spa-router', async () => {
  const { writable: w } = await import('svelte/store');
  const { default: FakeRouter } = await import('./FakeRouter.svelte');
  return { default: FakeRouter, link: () => ({ destroy: () => {} }), location: w('/') };
});

import { bootstrapFirstAdmin } from '@application/services/authService';

import { routes } from '../src/ui/router';
import Home from '../src/ui/routes/Home.svelte';
import NotFound from '../src/ui/routes/NotFound.svelte';
import Login from '../src/ui/routes/Login.svelte';

// ─── router.ts ───────────────────────────────────────────────────────────────

describe('router — routes map', () => {
  it('exports a routes object', () => {
    expect(typeof routes).toBe('object');
    expect(routes).not.toBeNull();
  });

  it('maps "/" to Home', () => {
    expect(routes['/']).toBe(Home);
  });

  it('maps "*" to NotFound (catch-all)', () => {
    expect(routes['*']).toBe(NotFound);
  });

  it('has entries for all seven named routes', () => {
    const keys = Object.keys(routes);
    expect(keys).toContain('/');
    expect(keys).toContain('/trips');
    expect(keys).toContain('/configuration');
    expect(keys).toContain('/questions');
    expect(keys).toContain('/messaging');
    expect(keys).toContain('/wellness');
    expect(keys).toContain('/review');
  });

  it('has 8 total entries (7 named + catch-all)', () => {
    expect(Object.keys(routes).length).toBe(8);
  });

  it('every value is a function (Svelte constructor)', () => {
    for (const component of Object.values(routes)) {
      expect(typeof component).toBe('function');
    }
  });
});

// ─── Home.svelte ─────────────────────────────────────────────────────────────

describe('Home route', () => {
  it('renders without throwing', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Home({ target: host });
    await tick();
    expect(host.innerHTML.length).toBeGreaterThan(0);
  });

  it('contains "Welcome" heading text', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Home({ target: host });
    await tick();
    expect(host.innerHTML).toContain('Welcome');
  });

  it('contains the onboarding message about picking a workspace', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Home({ target: host });
    await tick();
    expect(host.innerHTML.toLowerCase()).toContain('workspace');
  });
});

// ─── NotFound.svelte ─────────────────────────────────────────────────────────

describe('NotFound route', () => {
  it('renders without throwing', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new NotFound({ target: host });
    await tick();
    expect(host.innerHTML.length).toBeGreaterThan(0);
  });

  it('contains "Not Found" text', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new NotFound({ target: host });
    await tick();
    expect(host.innerHTML).toContain('Not Found');
  });

  it('indicates the route does not exist', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new NotFound({ target: host });
    await tick();
    expect(host.innerHTML.toLowerCase()).toContain('not exist');
  });
});

// ─── Login.svelte ─────────────────────────────────────────────────────────────

describe('Login route — default (login) mode', () => {
  it('renders a form element', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();
    expect(host.querySelector('form')).not.toBeNull();
  });

  it('renders username and password inputs', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();
    const inputs = host.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the "Sign in" title by default', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();
    expect(host.innerHTML).toContain('Sign in');
  });

  it('has a submit button', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();
    const submitBtn = host.querySelector('button[type="submit"]');
    expect(submitBtn).not.toBeNull();
  });

  it('shows a "Register" mode switch button', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();
    const buttons = Array.from(host.querySelectorAll('button'));
    const registerBtn = buttons.find((b) => b.textContent?.includes('Register'));
    expect(registerBtn).toBeDefined();
  });
});

describe('Login route — register mode switch', () => {
  async function clickAndFlush(btn: Element): Promise<void> {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
  }

  it('shows role select after clicking Register', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();

    const registerBtn = Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Register') && (b as HTMLButtonElement).type !== 'submit');
    expect(registerBtn).toBeDefined();
    await clickAndFlush(registerBtn!);

    expect(host.querySelector('select')).not.toBeNull();
  });

  it('shows "Create account" heading in register mode', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();

    const registerBtn = Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Register') && (b as HTMLButtonElement).type !== 'submit');
    expect(registerBtn).toBeDefined();
    await clickAndFlush(registerBtn!);

    expect(host.innerHTML).toContain('Create account');
  });

  it('shows a "Sign in" button to switch back from register mode', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();

    const registerBtn = Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Register') && (b as HTMLButtonElement).type !== 'submit');
    await clickAndFlush(registerBtn!);

    const signInBtn = Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Sign in') && (b as HTMLButtonElement).type !== 'submit');
    expect(signInBtn).toBeDefined();
  });
});

// ─── Login.svelte — form submission ──────────────────────────────────────────

describe('Login route — form submission', () => {
  async function setInput(host: Element, index: number, value: string): Promise<void> {
    const input = host.querySelectorAll('input')[index] as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
  }

  async function submitForm(host: Element): Promise<void> {
    host.querySelector('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    // PBKDF2 (100k iterations) takes ~100–200ms in the test environment
    await new Promise(r => setTimeout(r, 500));
    await tick();
    await tick();
  }

  it('calls login in login mode on valid credentials (no error shown)', async () => {
    await bootstrapFirstAdmin('submit_user', 'Pass123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();

    await setInput(host, 0, 'submit_user');
    await setInput(host, 1, 'Pass123!');
    await submitForm(host);

    expect(host.querySelector('p[style*="ff7676"]')).toBeNull();
  });

  it('shows error message when login fails', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();

    await setInput(host, 0, 'nobody');
    await setInput(host, 1, 'wrongpassword');
    await submitForm(host);

    expect(host.innerHTML).toContain('color: #ff7676');
  });

  it('submits in register mode (calls register + login)', async () => {
    await bootstrapFirstAdmin('reg_admin', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();

    const registerBtn = Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Register') && (b as HTMLButtonElement).type !== 'submit');
    registerBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    await tick();

    await setInput(host, 0, 'new_dispatcher');
    await setInput(host, 1, 'Disp123!');
    await submitForm(host);

    // No error means register + login succeeded
    expect(host.querySelector('p[style*="ff7676"]')).toBeNull();
  });

  it('shows bootstrap mode UI when adminMissing is true', async () => {
    // Inject adminMissing=true directly to bypass the async IDB onMount detection
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host, props: { initialAdminMissing: true } });
    await tick();

    // adminMissing = true → First-run setup button appears
    expect(host.innerHTML).toContain('First-run setup');
  });

  it('clicking warning card link switches to bootstrap mode', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host, props: { initialAdminMissing: true } });
    await tick();

    // The warning card has a "first-run setup" link button (lowercase, class=link)
    const linkBtn = Array.from(host.querySelectorAll('button.link'))
      .find((b) => b.textContent?.toLowerCase().includes('first-run setup'));
    expect(linkBtn).toBeDefined();
    linkBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    await tick();

    expect(host.innerHTML).toContain('Create administrator');
  });

  it('cycles through all three modes in a single component instance', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host, props: { initialAdminMissing: true } });
    await tick();

    // login → register
    const registerBtn = Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Register') && (b as HTMLButtonElement).type !== 'submit');
    expect(registerBtn).toBeDefined();
    registerBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick(); await tick();
    expect(host.querySelector('select')).not.toBeNull();

    // register → bootstrap
    const bootstrapModeBtn = Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('First-run setup') && (b as HTMLButtonElement).type !== 'submit');
    expect(bootstrapModeBtn).toBeDefined();
    bootstrapModeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick(); await tick();
    expect(host.innerHTML).toContain('Create administrator');

    // bootstrap → login
    const signInBtn = Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Sign in') && (b as HTMLButtonElement).type !== 'submit');
    expect(signInBtn).toBeDefined();
    signInBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick(); await tick();
    expect(host.querySelector('select')).toBeNull();
    expect(host.innerHTML).toContain('Sign in');
  });

  it('clicking Sign in from register mode switches back to login', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();

    const registerBtn = Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Register') && (b as HTMLButtonElement).type !== 'submit');
    registerBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    await tick();

    const signInBtn = Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Sign in') && (b as HTMLButtonElement).type !== 'submit');
    expect(signInBtn).toBeDefined();
    signInBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    await tick();

    expect(host.innerHTML).toContain('Sign in');
    expect(host.querySelector('select')).toBeNull();
  });

  it('submits in bootstrap mode (calls bootstrapFirstAdmin)', async () => {
    // Use initialAdminMissing=true so the First-run setup button is guaranteed visible
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host, props: { initialAdminMissing: true } });
    await tick();

    // Click First-run setup button to switch to bootstrap mode
    const bootstrapBtn = Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('First-run setup') && (b as HTMLButtonElement).type !== 'submit');
    expect(bootstrapBtn).toBeDefined();

    bootstrapBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    await tick();

    await setInput(host, 0, 'bootstrap_admin');
    await setInput(host, 1, 'Admin123!');
    await submitForm(host);

    expect(host.querySelector('p[style*="ff7676"]')).toBeNull();
  });

  it('submits in register mode with a non-empty department (covers department || null truthy branch)', async () => {
    await bootstrapFirstAdmin('dept_reg_admin', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();

    // Switch to register mode
    const registerBtn = Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Register') && (b as HTMLButtonElement).type !== 'submit');
    expect(registerBtn).toBeDefined();
    registerBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    await tick();

    // In register mode: selects[0] = role, selects[1] = department
    const selects = host.querySelectorAll<HTMLSelectElement>('select');
    expect(selects.length).toBeGreaterThanOrEqual(2);
    const deptSelect = selects[1];
    // Pick the first real department option (index 1, skipping "— none —")
    const firstDept = Array.from(deptSelect.options).find(o => o.value !== '');
    if (firstDept) {
      deptSelect.value = firstDept.value;
      deptSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await tick();
    }

    await setInput(host, 0, 'dept_dispatcher');
    await setInput(host, 1, 'Disp123!');
    await submitForm(host);

    // No error element means register + login succeeded
    expect(host.querySelector('p[style*="ff7676"]')).toBeNull();
  });

  it('submits in bootstrap mode with a non-empty department (covers department || null truthy branch)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host, props: { initialAdminMissing: true } });
    await tick();

    // Switch to bootstrap mode
    const bootstrapBtn = Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('First-run setup') && (b as HTMLButtonElement).type !== 'submit');
    expect(bootstrapBtn).toBeDefined();
    bootstrapBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    await tick();

    // In bootstrap mode: selects[0] = department only (no role select)
    const deptSelect = host.querySelector<HTMLSelectElement>('select');
    expect(deptSelect).not.toBeNull();
    const firstDept = Array.from(deptSelect!.options).find(o => o.value !== '');
    if (firstDept) {
      deptSelect!.value = firstDept.value;
      deptSelect!.dispatchEvent(new Event('change', { bubbles: true }));
      await tick();
    }

    await setInput(host, 0, 'dept_bootstrap_admin');
    await setInput(host, 1, 'Admin123!');
    await submitForm(host);

    expect(host.querySelector('p[style*="ff7676"]')).toBeNull();
  });

  it('shows "Authentication failed" fallback when login throws a non-Error value', async () => {
    // Temporarily spy on authService.login to throw a plain string (not an Error instance)
    const authModule = await import('@application/services/authService');
    const loginSpy = vi.spyOn(authModule, 'login').mockRejectedValueOnce('plain-string-throw');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();

    await setInput(host, 0, 'any_user');
    await setInput(host, 1, 'any_pass');
    await submitForm(host);

    loginSpy.mockRestore();

    // The ternary `e instanceof Error ? e.message : 'Authentication failed'`
    // hits the false branch when e is a plain string.
    expect(host.innerHTML).toContain('Authentication failed');
  });

  it('submit button shows "…" while login is in-flight (covers busy=true branch)', async () => {
    let resolveFn!: () => void;
    const hangingPromise = new Promise<void>(r => { resolveFn = r; });

    const authModule = await import('@application/services/authService');
    const loginSpy = vi.spyOn(authModule, 'login').mockReturnValueOnce(hangingPromise as unknown as Promise<{ userId: string; role: string; token: string }>);

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host });
    await tick();

    await setInput(host, 0, 'any_user');
    await setInput(host, 1, 'any_pass');

    // Dispatch submit without waiting — catch the in-flight busy state
    host.querySelector('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await tick();
    await tick();

    const submitBtn = host.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submitBtn?.textContent?.trim()).toBe('…');

    // Resolve so the component cleans up
    resolveFn();
    await tick();
    await tick();
    loginSpy.mockRestore();
  });

  it('covers register→bootstrap→register mode cycle (outer block UPDATE + inner CREATE/DESTROY)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Login({ target: host, props: { initialAdminMissing: true } });
    await tick();

    // login → register
    const regBtn = Array.from(host.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Register') && (b as HTMLButtonElement).type !== 'submit');
    regBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick(); await tick();
    expect(host.querySelector('select')).not.toBeNull();

    // register → bootstrap (outer stays truthy, inner role select destroyed → UPDATE outer block)
    const bootstrapBtn = Array.from(host.querySelectorAll('button'))
      .find(b => b.textContent?.includes('First-run setup') && (b as HTMLButtonElement).type !== 'submit');
    bootstrapBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick(); await tick();
    // only department select remains (no role select in bootstrap mode)
    const selects = host.querySelectorAll('select');
    expect(selects.length).toBe(1);

    // bootstrap → register (outer stays truthy, inner role select re-created → CREATE within UPDATE)
    const regBtn2 = Array.from(host.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Register') && (b as HTMLButtonElement).type !== 'submit');
    regBtn2!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick(); await tick();
    expect(host.querySelectorAll('select').length).toBe(2);
  });
});
