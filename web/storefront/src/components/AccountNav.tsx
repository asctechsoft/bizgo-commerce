'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { browserApi } from '@/lib/api';
import { CART_CHANGED } from './HeaderTools';

const ITEMS = [
  { href: '/tai-khoan', key: 'overview', exact: true },
  { href: '/tai-khoan/don-hang', key: 'orders' },
  { href: '/tai-khoan/dia-chi', key: 'addresses' },
] as const;

/** Prototype `.account-nav`: sidebar on desktop, horizontal strip on phones. */
export function AccountNav() {
  const t = useTranslations('account.nav');
  const pathname = usePathname();
  const router = useRouter();
  const item = 'block whitespace-nowrap rounded-[10px] px-3 py-3 text-left text-[12px]';
  return (
    <nav
      aria-label={t('overview')}
      className="flex gap-[3px] overflow-x-auto rounded-[17px] border border-line bg-white p-2.5 sm:p-5 md:flex-col"
    >
      {ITEMS.map((i) => {
        const active = 'exact' in i ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? 'page' : undefined}
            className={`${item} ${active ? 'bg-green-mint font-bold text-green' : 'text-[#53695b] hover:bg-green-mint hover:text-green'}`}
          >
            {t(i.key)}
          </Link>
        );
      })}
      <button
        type="button"
        className={`${item} text-[#53695b] hover:bg-green-mint hover:text-green`}
        onClick={async () => {
          try {
            await browserApi().auth.logout();
          } finally {
            window.dispatchEvent(new Event(CART_CHANGED));
            router.push('/dang-nhap');
          }
        }}
      >
        {t('logout')}
      </button>
    </nav>
  );
}
