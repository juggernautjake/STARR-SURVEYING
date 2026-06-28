// F1 — source-lock for the file-explorer permission model.
import { describe, it, expect } from 'vitest';
import {
  accessRank,
  maxAccess,
  accessFromGrants,
  resolveAccess,
  canView,
  canDownload,
  canEdit,
  canManage,
  type PermissionGrant,
  type NodeWithGrants,
  type FileUser,
} from '@/lib/files/permissions';

const user: FileUser = { email: 'mary@starr-surveying.com', roles: ['field_crew', 'employee'] };
const g = (t: PermissionGrant['grantee_type'], v: string | null, a: PermissionGrant['access_level']): PermissionGrant => ({
  grantee_type: t,
  grantee_value: v,
  access_level: a,
});

describe('files: ordering helpers', () => {
  it('ranks and maxes access levels', () => {
    expect(accessRank('none')).toBeLessThan(accessRank('view'));
    expect(accessRank('view')).toBeLessThan(accessRank('manage'));
    expect(maxAccess('view', 'edit')).toBe('edit');
    expect(maxAccess('download', 'view')).toBe('download');
  });
  it('can* gates', () => {
    expect(canView('view')).toBe(true);
    expect(canDownload('view')).toBe(false);
    expect(canDownload('download')).toBe(true);
    expect(canEdit('download')).toBe(false);
    expect(canEdit('edit')).toBe(true);
    expect(canManage('edit')).toBe(false);
    expect(canManage('manage')).toBe(true);
  });
});

describe('files: accessFromGrants', () => {
  it('takes the max of every matching grant (everyone/role/user)', () => {
    const grants = [g('everyone', null, 'view'), g('role', 'field_crew', 'download'), g('user', 'mary@starr-surveying.com', 'edit')];
    expect(accessFromGrants(grants, user)).toBe('edit');
  });
  it('matches roles + emails case-insensitively', () => {
    expect(accessFromGrants([g('role', 'FIELD_CREW', 'download')], user)).toBe('download');
    expect(accessFromGrants([g('user', 'MARY@Starr-Surveying.com', 'manage')], user)).toBe('manage');
  });
  it('returns none when nothing matches', () => {
    expect(accessFromGrants([g('role', 'admin', 'manage'), g('user', 'someone@else.com', 'edit')], user)).toBe('none');
  });
  it('everyone-grant applies to all', () => {
    expect(accessFromGrants([g('everyone', null, 'download')], user)).toBe('download');
  });
});

describe('files: resolveAccess (inheritance + overrides)', () => {
  const node = (over: Partial<NodeWithGrants>): NodeWithGrants => ({
    id: 'n',
    permission_mode: 'inherit',
    owner_email: null,
    grants: [],
    ...over,
  });

  it('admin always gets manage', () => {
    expect(resolveAccess([node({ permission_mode: 'custom', grants: [] })], user, true)).toBe('manage');
  });
  it('owner of target or an ancestor gets manage', () => {
    const chain = [node({ id: 'root', owner_email: 'mary@starr-surveying.com' }), node({ id: 'child' })];
    expect(resolveAccess(chain, user)).toBe('manage');
  });
  it('inherit walks up to the nearest custom ancestor', () => {
    const chain = [
      node({ id: 'root', permission_mode: 'custom', grants: [g('role', 'field_crew', 'download')] }),
      node({ id: 'mid', permission_mode: 'inherit' }),
      node({ id: 'leaf', permission_mode: 'inherit' }),
    ];
    expect(resolveAccess(chain, user)).toBe('download');
  });
  it('custom node breaks inheritance (its grants are authoritative)', () => {
    const chain = [
      node({ id: 'root', permission_mode: 'custom', grants: [g('everyone', null, 'edit')] }),
      node({ id: 'leaf', permission_mode: 'custom', grants: [g('role', 'admin', 'manage')] }), // no match for mary
    ];
    expect(resolveAccess(chain, user)).toBe('none');
  });
  it('no custom ancestor anywhere → none', () => {
    const chain = [node({ id: 'root' }), node({ id: 'leaf' })];
    expect(resolveAccess(chain, user)).toBe('none');
  });
  it('empty chain → none', () => {
    expect(resolveAccess([], user)).toBe('none');
  });
});
