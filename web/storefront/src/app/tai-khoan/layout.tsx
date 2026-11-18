import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { AccountNav } from '@/components/AccountNav';
import { PageHead } from '@/components/PageHead';

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('account');
  return (
    <div>
      <PageHead crumbs={[{ label: t('title') }]} title={t('title')} />
      <div className="mt-6 grid gap-[25px] md:grid-cols-[235px_minmax(0,1fr)]">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
