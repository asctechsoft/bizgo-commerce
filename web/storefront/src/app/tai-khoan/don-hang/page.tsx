import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OrdersList } from '@/components/OrdersView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('orders');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page() {
  const t = await getTranslations('orders');
  return (
    <div className="pt-6">
      <h1 className="m-0 text-2xl font-extrabold">{t('title')}</h1>
      <OrdersList />
    </div>
  );
}
