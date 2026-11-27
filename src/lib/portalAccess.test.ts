import { describe, expect, it } from 'vitest';
import { hasPlatformSectionAccess, resolvePlatformLanding } from './portalAccess';

const sections = [
  { id: 'overview', permission: 'platform.read' },
  { id: 'offices', permission: 'offices.manage' },
  { id: 'finance', permission: 'finance.read' },
];

describe('platform portal access', () => {
  it('routes Super Admin directly to the platform overview', () => {
    expect(resolvePlatformLanding(['super_admin'], [], sections)).toBe('/admin/overview');
  });

  it('routes limited platform staff to their first permitted module', () => {
    expect(resolvePlatformLanding(['admin_staff'], ['offices.manage'], sections)).toBe('/admin/offices');
  });

  it('does not admit a customer to the platform portal', () => {
    expect(resolvePlatformLanding(['customer'], ['platform.manage'], sections)).toBeNull();
    expect(hasPlatformSectionAccess(['customer'], ['platform.manage'], 'offices.manage')).toBe(false);
  });

  it('grants only the assigned section unless platform.manage is present', () => {
    expect(hasPlatformSectionAccess(['admin_staff'], ['offices.manage'], 'offices.manage')).toBe(true);
    expect(hasPlatformSectionAccess(['admin_staff'], ['offices.manage'], 'finance.read')).toBe(false);
    expect(hasPlatformSectionAccess(['admin_staff'], ['platform.manage'], 'finance.read')).toBe(true);
  });
});
