import {
  FACTORY_FORBIDDEN_PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_REALM,
  ROLE_CODES,
  PERMISSIONS,
  normalizeVi,
  slugify,
  stripLatexResidue,
} from '../src';

describe('text helpers', () => {
  it('slugifies Vietnamese names', () => {
    expect(slugify('Cùi bưởi tươi trắng')).toBe('cui-buoi-tuoi-trang');
    expect(slugify('Bột Nấu Chè, Tinh Bột & Ngô Bung')).toBe('bot-nau-che-tinh-bot-ngo-bung');
    expect(slugify('Đường Nhật Tường')).toBe('duong-nhat-tuong');
    expect(slugify('Trân châu 3Q đen')).toBe('tran-chau-3q-den');
  });

  it('normalizes for search', () => {
    expect(normalizeVi('Cùi Zip')).toBe('cui zip');
    expect(normalizeVi('Đậu ĐỎ to')).toBe('dau do to');
  });

  it('strips LaTeX residue from source notes without losing meaning', () => {
    expect(stripLatexResidue('Quy cách $5\\text{ kg}$/bao')).toBe('Quy cách 5 kg/bao');
    expect(stripLatexResidue('Đóng túi $2\\text{ kg}$')).toBe('Đóng túi 2 kg');
    expect(stripLatexResidue('Tấn / Tạ / Yến')).toBe('Tấn / Tạ / Yến');
  });
});

describe('permission table invariants', () => {
  it('only references known permission codes', () => {
    const known = new Set<string>(PERMISSIONS);
    for (const role of ROLE_CODES) {
      for (const p of ROLE_PERMISSIONS[role]) expect(known.has(p)).toBe(true);
    }
  });

  it('factory roles never receive finance/pricing/PII permissions', () => {
    for (const role of ROLE_CODES.filter((r) => ROLE_REALM[r] === 'FACTORY')) {
      for (const p of ROLE_PERMISSIONS[role]) {
        expect(FACTORY_FORBIDDEN_PERMISSIONS).not.toContain(p);
      }
    }
  });

  it('customers cannot read cost, margin or other customers orders', () => {
    for (const role of ['CUSTOMER', 'WHOLESALE_CUSTOMER'] as const) {
      const perms = ROLE_PERMISSIONS[role];
      for (const forbidden of ['cost:read', 'margin:read', 'order:read:all', 'pii:read'] as const) {
        expect(perms).not.toContain(forbidden);
      }
    }
  });

  it('only OWNER holds role/settings administration', () => {
    for (const role of ROLE_CODES.filter((r) => r !== 'OWNER')) {
      expect(ROLE_PERMISSIONS[role]).not.toContain('role:manage');
      expect(ROLE_PERMISSIONS[role]).not.toContain('settings:write');
      expect(ROLE_PERMISSIONS[role]).not.toContain('user:manage');
    }
  });
});
