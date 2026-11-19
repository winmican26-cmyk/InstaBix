/**
 * Pure role policy. Kept free of `server-only`, database and Next.js imports so
 * the access rule can be tested in isolation and shared by every server entry
 * point (pages, actions and route handlers).
 */

export type Role = "owner" | "admin" | "operator" | "reviewer" | "creator";

/** Self-registered creators are tenants of the operator, not operators. */
export const CREATOR_ROLE = "creator" as const satisfies Role;

/** Explicit allowlist. An unknown or future role is denied, not granted. */
const OPERATOR_ROLES = new Set<Role>(["owner", "admin", "operator", "reviewer"]);

/**
 * The single deny rule for the operator `(app)` surface and every API that
 * reads a workspace. Values come from the database at runtime, so this is an
 * allowlist rather than "anything that is not creator".
 */
export function canAccessOperator(role: Role): boolean {
  return OPERATOR_ROLES.has(role);
}

/**
 * True when a user has at least one operator-eligible membership. Used by
 * onboarding and workspace creation so a creator-only session cannot mint an
 * owner membership or read operator aggregates through those entry points.
 */
export function hasOperatorMembership(roles: readonly Role[]): boolean {
  return roles.some((role) => canAccessOperator(role));
}

export function canManage(role: Role): boolean {
  return role === "owner" || role === "admin";
}

export function canReview(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "operator" || role === "reviewer";
}
