import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AddressesView } from '@/components/AddressesView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('address');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page() {
  const t = await getTranslations('address');
  return (
    <div>
      <h2 className="m-0 text-xl font-extrabold">{t('title')}</h2>
      <AddressesView />
    </div>
  );
}
