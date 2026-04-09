export type Role = 'administrator' | 'dispatcher' | 'content_author' | 'reviewer';

export const ALL_ROLES: Role[] = ['administrator', 'dispatcher', 'content_author', 'reviewer'];

export const ROLE_LABELS: Record<Role, string> = {
  administrator: 'Administrator',
  dispatcher: 'Dispatcher',
  content_author: 'Content Author',
  reviewer: 'Reviewer / Grader'
};

export interface Principal {
  username: string;
  role: Role;
  /**
   * Functional department scope. Drives access to department-scoped
   * resources (e.g. attempt submission against a department-restricted
   * question). `null` means the user has not been assigned to any
   * department and therefore CANNOT submit attempts on questions whose
   * `applicableDepartments` list is non-empty.
   */
  department: string | null;
}
