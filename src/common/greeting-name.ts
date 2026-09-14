/**
 * Prefer first name from display name, then username.
 * Used for {{username}} in notification templates (greeting, not handle).
 */
export function greetingName(user: {
  name?: string | null;
  username?: string | null;
}): string {
  const first = user.name?.trim().split(/\s+/).find(Boolean);
  if (first) return first;
  return user.username?.trim() || '';
}
