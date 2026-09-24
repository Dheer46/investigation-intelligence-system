export function roleLabel(role: string | undefined): string {
  if (!role) return '';
  return role.charAt(0) + role.slice(1).toLowerCase();
}
