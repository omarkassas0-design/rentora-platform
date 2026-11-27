export type PlatformRole = 'super_admin' | 'admin_staff' | string;

export type PlatformSection = {
  id: string;
  permission?: string;
};

/** Resolve the first safe landing page from verified database roles and grants. */
export function resolvePlatformLanding(
  roles: readonly PlatformRole[],
  permissionIds: readonly string[],
  sections: readonly PlatformSection[],
): string | null {
  if (roles.includes('super_admin')) return '/admin/overview';
  if (!roles.includes('admin_staff')) return null;

  const grants = new Set(permissionIds);
  if (grants.has('platform.manage')) return '/admin/overview';
  const firstAllowed = sections.find(section => section.permission && grants.has(section.permission));
  return firstAllowed ? `/admin/${firstAllowed.id}` : null;
}

/** Client-side route gate mirrors the database's platform role/permission model. */
export function hasPlatformSectionAccess(
  roles: readonly PlatformRole[],
  permissionIds: readonly string[],
  requiredPermission: string | undefined,
): boolean {
  if (roles.includes('super_admin')) return true;
  if (!roles.includes('admin_staff')) return false;
  if (!requiredPermission) return false;
  const grants = new Set(permissionIds);
  return grants.has('platform.manage') || grants.has(requiredPermission);
}
