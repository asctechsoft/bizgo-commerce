import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

export async function Footer() {
  const t = await getTranslations('footer');
  const b = await getTranslations('brand');
  return (
    <footer className="mt-10 border-t border-line bg-green-soft pb-24 pt-8 sm:pb-8">
      <div className="mx-auto grid w-full max-w-page gap-6 px-[18px] sm:px-[22px] md:grid-cols-[1.2fr_2fr]">
        <div>
          <Image
            src="/brand/logo.png"
            alt={b('name')}
            width={120}
            height={60}
            className="h-10 w-auto"
          />
          <p className="mt-2 text-[13px] font-semibold text-green">{b('tagline')}</p>
        </div>
        <div>
          <p className="m-0 max-w-2xl text-[13px] text-muted">{t('about')}</p>
          <p className="mt-2 text-xs font-semibold text-orange-deep">{t('legalPending')}</p>
          <p className="mt-4 text-xs text-muted">
            {t('rights', { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  );
}
