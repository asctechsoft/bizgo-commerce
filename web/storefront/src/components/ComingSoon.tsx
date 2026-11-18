import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@bizgo/ui-web';
import { PageHead } from './PageHead';

/** Honest placeholder for pages that are in the menu but not built yet (no fake forms, no invented contact data). */
export async function ComingSoon({
  titleKey,
}: {
  titleKey: 'wholesaleTitle' | 'guidesTitle' | 'contactTitle';
}) {
  const t = await getTranslations('pages');
  return (
    <div>
      <PageHead crumbs={[{ label: t(titleKey) }]} title={t(titleKey)} />
      <div className="mt-6">
        <EmptyState
          title={t('soonTitle')}
          description={t('soonText')}
          icon="🚧"
          action={
            <Link
              href="/danh-muc"
              className="inline-flex min-h-tap items-center rounded-control bg-green px-5 text-[13px] font-bold text-white"
            >
              {t('goShop')}
            </Link>
          }
        />
      </div>
    </div>
  );
}
