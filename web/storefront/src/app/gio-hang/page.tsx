import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CartView } from '@/components/CartView';
import { PageHead } from '@/components/PageHead';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('cart');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page() {
  const t = await getTranslations('cart');
  return (
    <div>
      <PageHead crumbs={[{ label: t('title') }]} title={t('title')} />
      <CartView />
    </div>
  );
}
