import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { MobileBar } from '@/components/MobileBar';
import './globals.css';

export const dynamic = 'force-dynamic';

const font = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-be-vietnam',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: { default: t('title'), template: '%s • BizGo' },
    description: t('description'),
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  };
}

export const viewport: Viewport = { themeColor: '#176a3a', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  const t = await getTranslations('common');
  return (
    <html lang="vi" className={font.variable}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-white focus:px-4 focus:py-2 focus:font-bold focus:text-green"
          >
            {t('skipToContent')}
          </a>
          <Header />
          <main
            id="main"
            className="mx-auto min-h-[60vh] w-full max-w-page px-[18px] pb-24 sm:px-[22px] md:pb-20"
          >
            {children}
          </main>
          <Footer />
          <MobileBar />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
