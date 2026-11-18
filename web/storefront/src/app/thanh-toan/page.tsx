import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CheckoutView } from '@/components/CheckoutView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('checkout');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page() {
  const t = await getTranslations('checkout');
  return (
    <div className="pt-6">
      <h1 className="m-0 text-2xl font-extrabold">{t('title')}</h1>
      <CheckoutView />
    </div>
  );
}
