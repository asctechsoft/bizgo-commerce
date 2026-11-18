'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@bizgo/ui-web';
import { useBackoffice } from './AuthGate';

const NAV = [
  { href: '/admin', key: 'dashboard', exact: true },
  { href: '/admin/catalog/products', key: 'products' },
  { href: '/admin/orders', key: 'orders' },
  { href: '/admin/inventory', key: 'inventory' },
  { href: '/admin/support', key: 'support' },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const { session, logout } = useBackoffice();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2"
      >
        {t('common.skip')}
      </a>
      <aside className="border-b border-line bg-green-deep text-white md:min-h-screen md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:block md:py-5">
          <p className="m-0 text-[15px] font-extrabold">{t('brand.admin')}</p>
          <p className="m-0 hidden text-xs text-[#bfe3c9] md:mt-1 md:block">
            {session.user.displayName}
          </p>
        </div>
        <nav
          aria-label={t('nav.aria')}
          className="flex gap-1 overflow-x-auto px-2 pb-2 md:block md:px-3"
        >
          {NAV.map((n) => {
            const active = 'exact' in n ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-tap items-center whitespace-nowrap rounded-control px-3 text-[13px] font-semibold md:mb-1 ${active ? 'bg-white text-green' : 'text-white hover:bg-[#1b6b3c]'}`}
              >
                {t(`nav.${n.key}`)}
              </Link>
            );
          })}
          <span className="hidden min-h-tap items-center px-3 text-[12px] text-[#9fcfae] md:flex">
            {t('nav.categories')} · {t('nav.comingSoon')}
          </span>
        </nav>
        <div className="hidden px-3 pb-4 md:block">
          <Button variant="ghost" className="w-full" onClick={() => void logout()}>
            {t('common.logout')}
          </Button>
        </div>
      </aside>
      <div id="content" className="min-w-0 p-4 sm:p-6">
        <div className="mb-4 flex justify-end md:hidden">
          <Button variant="ghost" onClick={() => void logout()}>
            {t('common.logout')}
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
