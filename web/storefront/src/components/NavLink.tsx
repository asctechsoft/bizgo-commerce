'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Header menu link that knows when it is the current section. `match` lists extra path prefixes that
 * should light the same tab (e.g. product pages keep "Sản phẩm" active). Home matches exactly.
 */
export function NavLink({
  href,
  match = [],
  variant,
  children,
}: {
  href: string;
  match?: string[];
  variant: 'desktop' | 'mobile';
  children: ReactNode;
}) {
  const pathname = usePathname() ?? '/';
  const prefixes = [href, ...match];
  const active =
    href === '/'
      ? pathname === '/'
      : prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const base =
    variant === 'desktop'
      ? 'relative whitespace-nowrap py-3 text-[12px] font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:transition'
      : 'inline-flex min-h-[32px] items-center whitespace-nowrap border-b-2 text-[11px] font-bold';
  const state =
    variant === 'desktop'
      ? active
        ? 'text-green after:bg-green'
        : 'text-ink after:bg-transparent hover:text-green'
      : active
        ? 'border-green text-green'
        : 'border-transparent text-[#4c7a5a]';
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={`${base} ${state}`}>
      {children}
    </Link>
  );
}
