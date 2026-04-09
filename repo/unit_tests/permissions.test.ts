import { describe, it, expect } from 'vitest';
import { canAccess, visibleRoutes } from '@domain/auth/permissions';
import { ALL_ROLES, ROLE_LABELS } from '@domain/auth/role';

describe('canAccess', () => {
  it('denies anonymous', () => {
    expect(canAccess('trips', null)).toBe(false);
  });
  it('grants administrator everywhere', () => {
    for (const r of ['trips','configuration','questions','messaging','wellness','review','home'] as const) {
      expect(canAccess(r, 'administrator')).toBe(true);
    }
  });
  it('restricts dispatcher to operations routes', () => {
    expect(canAccess('trips', 'dispatcher')).toBe(true);
    expect(canAccess('configuration', 'dispatcher')).toBe(false);
    expect(canAccess('review', 'dispatcher')).toBe(false);
  });
  it('restricts content_author and reviewer accordingly', () => {
    expect(canAccess('questions', 'content_author')).toBe(true);
    expect(canAccess('review', 'content_author')).toBe(false);
    expect(canAccess('review', 'reviewer')).toBe(true);
    expect(canAccess('questions', 'reviewer')).toBe(false);
  });
});

describe('visibleRoutes', () => {
  it('returns no routes for null role', () => {
    expect(visibleRoutes(null)).toEqual([]);
  });
  it('returns role-appropriate routes', () => {
    const dispatcher = visibleRoutes('dispatcher');
    expect(dispatcher).toContain('trips');
    expect(dispatcher).not.toContain('configuration');
  });
});

describe('role labels', () => {
  it('has a label for every role', () => {
    for (const r of ALL_ROLES) {
      expect(ROLE_LABELS[r]).toBeTruthy();
    }
  });
});
