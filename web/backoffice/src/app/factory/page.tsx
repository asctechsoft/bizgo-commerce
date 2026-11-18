'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@bizgo/ui-web';
import { AuthGate, useBackoffice } from '@/components/AuthGate';

function FactoryHome() {
  const t = useTranslations();
  const { session, logout } = useBackoffice();
  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="m-0 text-2xl font-extrabold">{t('factory.title')}</h1>
        <Button variant="ghost" onClick={() => void logout()}>
          {t('common.logout')}
        </Button>
      </div>
      <p className="mt-3 font-semibold">
        {t('factory.welcome', { name: session.user.displayName })}
      </p>
      <div role="note" className="mt-4 rounded-card border border-line bg-white p-5 text-[14px]">
        {t('factory.notReady')}
      </div>
    </main>
  );
}

export default function FactoryPage() {
  return (
    <AuthGate realm="FACTORY">
      <FactoryHome />
    </AuthGate>
  );
}
