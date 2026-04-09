import type { Role } from './role';

export type RouteKey =
  | 'home'
  | 'trips'
  | 'configuration'
  | 'questions'
  | 'messaging'
  | 'wellness'
  | 'review';

const ROUTE_ACCESS: Record<RouteKey, Role[]> = {
  home: ['administrator', 'dispatcher', 'content_author', 'reviewer'],
  trips: ['dispatcher', 'administrator'],
  configuration: ['administrator'],
  questions: ['content_author', 'administrator'],
  messaging: ['administrator', 'dispatcher', 'content_author', 'reviewer'],
  wellness: ['administrator', 'dispatcher', 'content_author', 'reviewer'],
  review: ['reviewer', 'administrator']
};

export function canAccess(route: RouteKey, role: Role | null): boolean {
  if (!role) return false;
  return ROUTE_ACCESS[route].includes(role);
}

export function visibleRoutes(role: Role | null): RouteKey[] {
  if (!role) return [];
  return (Object.keys(ROUTE_ACCESS) as RouteKey[]).filter((k) => canAccess(k, role));
}
