'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

const ITEMS = [
  { href: '/', key: 'home', icon: '🏠' },
  { href: '/danh-muc', key: 'catalog', icon: '🗂️' },
  { href: '/danh-muc#tim-kiem', key: 'search', icon: '🔍' },
  { href: '/gio-hang', key: 'cart', icon: '🛒' },
  { href: '/dang-nhap', key: 'account', icon: '👤' },
] as const;

/** Bottom navigation for phones (<= 680px); 44px+ tap targets, safe-area aware. */
export function MobileBar() {
  const t = useTranslations('mobileBar');
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('label')}
      className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-white pb-[max(8px,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_20px_#00000008] sm:hidden"
    >
      {ITEMS.map((i) => {
        const active =
          i.href === '/'
            ? pathname === '/'
            : pathname.startsWith(i.href.split('#')[0] as string) && i.key !== 'search';
        return (
          <Link
            key={i.key}
            href={i.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-tap min-w-tap flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? 'text-green' : 'text-muted'}`}
          >
            <span aria-hidden="true" className="text-xl leading-none">
              {i.icon}
            </span>
            {t(i.key)}
          </Link>
        );
      })}
    </nav>
  );
}
