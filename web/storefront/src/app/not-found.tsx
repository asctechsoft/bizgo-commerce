import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@bizgo/ui-web';

export default async function NotFound() {
  const t = await getTranslations('errors');
  const c = await getTranslations('common');
  return (
    <div className="py-10">
      <EmptyState
        title={t('notFoundTitle')}
        description={t('notFoundText')}
        icon="🧭"
        action={
          <Link
            href="/"
            className="inline-flex min-h-tap items-center rounded-control bg-green px-5 text-[13px] font-bold text-white"
          >
            {c('backHome')}
          </Link>
        }
      />
    </div>
  );
}
