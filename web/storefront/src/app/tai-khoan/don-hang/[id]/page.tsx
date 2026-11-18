import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OrderDetailView } from '@/components/OrdersView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('orders');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('orders');
  return (
    <div>
      <h2 className="m-0 text-xl font-extrabold">{t('title')}</h2>
      <OrderDetailView id={id} />
    </div>
  );
}
