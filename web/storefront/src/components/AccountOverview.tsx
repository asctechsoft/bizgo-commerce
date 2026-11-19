'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Loader } from '@bizgo/ui-web';
import { browserApi } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { ApiErrorBox } from './ApiErrorBox';

export function AccountOverview() {
  const t = useTranslations('account');
  const data = useLoad(async () => {
    const api = browserApi();
    const [session, orders, addresses, cart] = await Promise.all([
      api.auth.session(),
      api.orders.list({ limit: 1 }),
      api.addresses.list(),
      api.cart.get(),
    ]);
    return {
      name: session.user.displayName,
      orders: orders.total,
      addresses: addresses.length,
      cart: cart.items.length,
    };
  });
  if (data.loading) return <Loader />;
  if (data.error) return <ApiErrorBox error={data.error} next="/tai-khoan" />;
  const d = data.data!;
  const cards = [
    { icon: '📦', label: t('cardOrders'), n: d.orders, href: '/tai-khoan/don-hang' },
    { icon: '📍', label: t('cardAddresses'), n: d.addresses, href: '/tai-khoan/dia-chi' },
    { icon: '🛒', label: t('cardCart'), n: d.cart, href: '/gio-hang' },
  ];
  return (
    <div>
      <div className="rounded-[20px] bg-gradient-to-br from-[#e7f5e8] to-[#f9fdf7] p-8">
        <div className="text-[11px] font-extrabold uppercase tracking-[1.4px] text-[#358e4d]">
          {t('hello')}
        </div>
        <h2 className="my-2 text-2xl font-extrabold">{d.name} 👋</h2>
        <p className="m-0 text-[12px] leading-[1.8] text-muted">{t('helloText')}</p>
      </div>
      <div className="mt-4 grid gap-3.5 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-[14px] border border-line bg-white p-[18px] hover:border-[#9fceb0] hover:shadow-card"
          >
            <div aria-hidden="true" className="text-[26px]">
              {c.icon}
            </div>
            <h3 className="my-1.5 text-[14px]">{c.label}</h3>
            <b>{c.n}</b>
          </Link>
        ))}
      </div>
    </div>
  );
}
