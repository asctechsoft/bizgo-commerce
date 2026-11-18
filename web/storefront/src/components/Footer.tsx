import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/** Prototype `.footer`: dark green, 4 columns. Pages that do not exist yet are shown as plain "coming soon" text, not dead links. */
export async function Footer() {
  const t = await getTranslations('footer');
  const b = await getTranslations('brand');
  const link = 'block text-[11px] leading-[2.1] text-[#bbd6c3] hover:text-white';
  const soon = (label: string) => (
    <span className="block text-[11px] leading-[2.1] text-[#8fb09b]">
      {label} · {t('soon')}
    </span>
  );
  return (
    <footer className="bg-[#103e27] pb-[85px] pt-[46px] text-[#ecf6ee] sm:pb-6">
      <div className="mx-auto w-full max-w-page px-[18px] sm:px-[22px]">
        <div className="grid grid-cols-2 gap-5 sm:gap-[35px] md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <Image
              src="/brand/logo.png"
              alt={b('name')}
              width={120}
              height={60}
              className="h-10 w-auto rounded bg-white px-2 py-1"
            />
            <p className="mb-0 mt-3 text-[11px] leading-[2.1] text-[#bbd6c3]">{t('about')}</p>
            <p className="m-0 text-[11px] leading-[2.1] text-[#ffcf9f]">⚠️ {t('legalPending')}</p>
          </div>
          <div>
            <h4 className="mb-4 mt-0 text-[13px]">{t('explore')}</h4>
            <Link href="/danh-muc" className={link}>
              {t('allProducts')}
            </Link>
            <Link href="/gio-hang" className={link}>
              {t('cart')}
            </Link>
          </div>
          <div>
            <h4 className="mb-4 mt-0 text-[13px]">{t('policies')}</h4>
            {soon(t('shipping'))}
            {soon(t('returns'))}
            {soon(t('privacy'))}
            {soon(t('terms'))}
          </div>
          <div>
            <h4 className="mb-4 mt-0 text-[13px]">{t('support')}</h4>
            <Link href="/tai-khoan" className={link}>
              {t('myAccount')}
            </Link>
            <Link href="/tai-khoan/don-hang" className={link}>
              {t('myOrders')}
            </Link>
            <Link href="/tai-khoan/dia-chi" className={link}>
              {t('addresses')}
            </Link>
          </div>
        </div>
        <div className="mt-[34px] border-t border-white/20 pt-[21px] text-[10px] text-[#bcd1c1]">
          {t('rights', { year: new Date().getFullYear() })} · {t('note')}
        </div>
      </div>
    </footer>
  );
}
