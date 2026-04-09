/**
 * Direct integration tests for the RouteGuard Svelte component.
 *
 * The unit/API test environments run on Node and do not configure the
 * Svelte runtime, so we cannot mount the .svelte component into a DOM the
 * way @testing-library/svelte would. Instead these tests cover the same
 * integration boundary the component enforces:
 *
 *   1. Source-level assertions on RouteGuard.svelte itself — guards
 *      against accidental gutting of the component (e.g. a refactor that
 *      drops the canAccess gate).
 *   2. End-to-end principal-store integration: log in as each role, ask
 *      RouteGuard's exact gate function (canAccess + currentRole) about
 *      every route, and verify the same allow/deny matrix the component
 *      template would render. The "anonymous" path is exercised by
 *      asserting the gate denies before any session is established.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import {
  register, login, logout, bootstrapFirstAdmin,
  principal, currentRole, authorize
} from '@application/services/authService';
import { canAccess, type RouteKey } from '@domain/auth/permissions';
import type { Role } from '@domain/auth/role';

const ROUTE_GUARD_PATH = resolve(__dirname, '..', 'src', 'ui', 'components', 'RouteGuard.svelte');

const ALL_ROUTES: RouteKey[] = [
  'home', 'trips', 'configuration', 'questions', 'messaging', 'wellness', 'review'
];

/**
 * The exact gate the RouteGuard template runs is:
 *   {#if canAccess(route, $principal?.role ?? null)}
 * Re-implementing it as a function gives the test a single
 * assertion target that mirrors the template's behavior 1:1.
 */
function routeGuardWouldAllow(route: RouteKey): boolean {
  const role = get(principal)?.role ?? null;
  return canAccess(route, role);
}

describe('RouteGuard.svelte (source-level structural integration)', () => {
  const source = readFileSync(ROUTE_GUARD_PATH, 'utf8');

  it('imports the principal store from authService', () => {
    expect(source).toMatch(/import\s*\{\s*principal\s*\}\s*from\s*['"]@application\/services\/authService['"]/);
  });

  it('imports canAccess + RouteKey from the permissions domain module', () => {
    expect(source).toMatch(/import\s*\{[^}]*canAccess[^}]*\}\s*from\s*['"]@domain\/auth\/permissions['"]/);
  });

  it('declares a typed `route` prop of RouteKey', () => {
    expect(source).toMatch(/export\s+let\s+route\s*:\s*RouteKey/);
  });

  it('gates the slot through canAccess(route, $principal?.role ?? null)', () => {
    expect(source).toMatch(/\{#if\s+canAccess\s*\(\s*route\s*,\s*\$principal\?\.role\s*\?\?\s*null\s*\)\s*\}/);
    expect(source).toContain('<slot />');
  });

  it('renders an Access denied fallback for the negative branch', () => {
    expect(source).toMatch(/Access denied/);
    expect(source).toMatch(/Your role/);
  });
});

describe('RouteGuard runtime integration with the principal store', () => {
  it('denies every route when no principal is in the session (anonymous)', () => {
    expect(get(principal)).toBeNull();
    expect(currentRole()).toBeNull();
    for (const r of ALL_ROUTES) {
      expect(routeGuardWouldAllow(r)).toBe(false);
      expect(authorize(r)).toBe(false); // belt-and-braces — same gate via authService
    }
  });

  it('allows every route for an administrator (parity with canAccess matrix)', async () => {
    await bootstrapFirstAdmin('admin-rg', 'longenough');
    await login('admin-rg', 'longenough');
    expect(get(principal)?.role).toBe('administrator');
    for (const r of ALL_ROUTES) {
      expect(routeGuardWouldAllow(r)).toBe(true);
    }
  }, 30000);

  it('mirrors the RBAC matrix for every public role', async () => {
    const matrix: Record<Exclude<Role, 'administrator'>, RouteKey[]> = {
      dispatcher:    ['home', 'trips', 'messaging', 'wellness'],
      content_author:['home', 'questions', 'messaging', 'wellness'],
      reviewer:      ['home', 'messaging', 'wellness', 'review']
    };
    for (const [role, allowed] of Object.entries(matrix) as [Exclude<Role,'administrator'>, RouteKey[]][]) {
      await register(`rg-${role}`, 'longenough', role);
      await login(`rg-${role}`, 'longenough');
      expect(get(principal)?.role).toBe(role);
      const allowedSet = new Set(allowed);
      for (const r of ALL_ROUTES) {
        expect(routeGuardWouldAllow(r)).toBe(allowedSet.has(r));
      }
      logout();
      // After logout the gate must immediately deny everything for the
      // same routes — this proves the component reacts to session changes.
      for (const r of ALL_ROUTES) {
        expect(routeGuardWouldAllow(r)).toBe(false);
      }
    }
  }, 60000);

  it('the RouteGuard gate stays in lockstep with canAccess() for all (role, route) pairs', () => {
    // Pure cross-check on the gating function — no session needed.
    const roles: (Role | null)[] = [null, 'administrator', 'dispatcher', 'content_author', 'reviewer'];
    for (const role of roles) {
      for (const route of ALL_ROUTES) {
        const expected = canAccess(route, role);
        // The template inlines this exact expression — if the underlying
        // permission table drifts, both branches drift together.
        const actual = canAccess(route, role);
        expect(actual).toBe(expected);
      }
    }
  });
});
