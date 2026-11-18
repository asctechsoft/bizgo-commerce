'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

const ITEMS = [
  { href: '/', key: 'home', icon: '🏠' },
  { href: '/danh-muc', key: 'catalog', icon: '▦' },
  { href: '/gio-hang', key: 'cart', icon: '🛒' },
  { href: '/tai-khoan/don-hang', key: 'orders', icon: '▤' },
  { href: '/tai-khoan', key: 'account', icon: '♙' },
] as const;

/** Bottom navigation for phones (<= 680px), same five items as the prototype; 44px+ tap targets, safe-area aware. */
export function MobileBar() {
  const t = useTranslations('mobileBar');
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('label')}
      className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-white pb-[max(9px,env(safe-area-inset-bottom))] pt-[7px] shadow-[0_-8px_20px_#00000008] sm:hidden"
    >
      {ITEMS.map((i) => {
        const active =
          i.href === '/'
            ? pathname === '/'
            : i.href === '/tai-khoan'
              ? pathname === '/tai-khoan'
              : pathname.startsWith(i.href);
        return (
          <Link
            key={i.key}
            href={i.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-tap min-w-tap flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${active ? 'text-green' : 'text-[#64786b]'}`}
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
