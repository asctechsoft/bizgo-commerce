'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { browserApi } from '@/lib/api';

export const CART_CHANGED = 'bizgo:cart-changed';

/** Header cart count + account link. Everything comes from the API (401 = signed out, count hidden). */
export function HeaderTools() {
  const t = useTranslations('header');
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const api = browserApi();
      api.cart
        .get()
        .then((c) => alive && setCount(c.items.reduce((s, i) => s + i.quantity, 0)))
        .catch(() => alive && setCount(null));
      api.auth
        .session()
        .then((s) => alive && setName(s.user.displayName))
        .catch(() => alive && setName(null));
    };
    load();
    window.addEventListener(CART_CHANGED, load);
    return () => {
      alive = false;
      window.removeEventListener(CART_CHANGED, load);
    };
  }, [pathname]);

  const tool =
    'flex min-h-tap items-center gap-[7px] whitespace-nowrap rounded-control px-1.5 text-[12px] text-[#334a3c] hover:text-green';
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
      <Link href="/gio-hang" className={tool} aria-label={t('cart')}>
        <span aria-hidden="true" className="text-[21px] leading-none">
          🛒
        </span>
        <span className="hidden lg:inline">{t('cart')}</span>
        {count !== null ? (
          <span className="rounded-full bg-orange px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            <span className="sr-only">{t('cartCount')}: </span>
            {count}
          </span>
        ) : null}
      </Link>
      <Link
        href={name ? '/tai-khoan/don-hang' : '/dang-nhap'}
        className={tool}
        aria-label={name ?? t('account')}
      >
        <span aria-hidden="true" className="text-[21px] leading-none">
          ♙
        </span>
        <span className="hidden max-w-[120px] truncate lg:inline">{name ?? t('account')}</span>
      </Link>
    </div>
  );
}
