import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AccountOverview } from '@/components/AccountOverview';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account');
  return { title: t('title'), robots: { index: false } };
}

export default function Page() {
  return <AccountOverview />;
}
