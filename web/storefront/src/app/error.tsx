'use client';

import { useTranslations } from 'next-intl';
import { Button, ErrorState } from '@bizgo/ui-web';

/** Route-level error boundary: real API failures are shown honestly, with retry. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  const c = useTranslations('common');
  return (
    <div className="py-10">
      <ErrorState
        title={t('title')}
        description={t('text')}
        {...(error.digest ? { requestId: error.digest } : {})}
        action={<Button onClick={reset}>{c('retry')}</Button>}
      />
    </div>
  );
}
