'use client';

import { useTranslations } from 'next-intl';
import { LoginPanel } from '@/components/AuthGate';

export default function FactoryLoginPage() {
  const t = useTranslations('login');
  return <LoginPanel realm="FACTORY" title={t('factoryTitle')} redirectTo="/factory" />;
}
