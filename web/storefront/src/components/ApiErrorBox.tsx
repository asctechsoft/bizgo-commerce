'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@bizgo/ui-web';
import { errorKey, isUnauthenticated } from '@/lib/errors';

/** Renders a failed API call; 401 becomes a login prompt (the session is cookie-based). */
export function ApiErrorBox({ error, next }: { error: unknown; next?: string }) {
  const t = useTranslations();
  if (isUnauthenticated(error)) {
    return (
      <ErrorState
        title={t('cart.loginTitle')}
        description={t('cart.loginText')}
        action={
          <Link
            href={`/dang-nhap${next ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="inline-flex min-h-tap items-center rounded-control bg-green px-5 text-[13px] font-bold text-white"
          >
            {t('cart.loginCta')}
          </Link>
        }
      />
    );
  }
  const { key, requestId } = errorKey(error);
  return <ErrorState title={t(key)} {...(requestId ? { requestId } : {})} />;
}
