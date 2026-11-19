import { Loader } from '@bizgo/ui-web';
import { getTranslations } from 'next-intl/server';

/** Route-level loading UI: branded box icon zooms in with an orbiting ring. */
export default async function Loading() {
  const t = await getTranslations('common');
  return <Loader variant="page" label={t('loading')} />;
}
