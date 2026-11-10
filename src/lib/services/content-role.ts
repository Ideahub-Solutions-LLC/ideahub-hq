/** Shared presentation predicate; runtime authorization is checked in content.ts. */
export function isContentEmployee(roleTitle: string) { return roleTitle.trim().toLowerCase() === "ai marketing content assistant"; }
