import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SupportView } from '@/components/SupportView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('support');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SupportView id={id} />;
}
