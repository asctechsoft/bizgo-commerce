'use client';

import { useTranslations } from 'next-intl';
import { LoginPanel } from '@/components/AuthGate';

export default function AdminLoginPage() {
  const t = useTranslations('login');
  return <LoginPanel realm="ADMIN" title={t('adminTitle')} redirectTo="/admin" />;
}
