import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ComingSoon } from '@/components/ComingSoon';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');
  return { title: t('wholesaleTitle') };
}

export default function Page() {
  return <ComingSoon titleKey="wholesaleTitle" />;
}
