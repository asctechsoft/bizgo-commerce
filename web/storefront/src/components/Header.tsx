import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { PublicCategory } from '@bizgo/contracts';
import { serverApi } from '@/lib/api';
import { HeaderTools } from './HeaderTools';
import { SearchBox } from './SearchBox';

async function loadCategories(): Promise<PublicCategory[]> {
  try {
    return await serverApi().catalog.categories();
  } catch {
    return []; // the page body shows the real error state; the header must not crash the layout
  }
}

const NAV_LINK = 'whitespace-nowrap py-3 text-[12px] font-semibold text-ink hover:text-green';

export async function Header() {
  const t = await getTranslations('header');
  const b = await getTranslations('brand');
  const categories = await loadCategories();
  return (
    <>
      {/* top strip (prototype .topstrip) — hidden on phones */}
      <div className="hidden bg-[#124e2d] text-[11px] text-white sm:block">
        <div className="mx-auto flex min-h-[32px] w-full max-w-page items-center justify-between gap-3 px-[22px]">
          <span>🌱 {t('stripLeft')}</span>
          <span>💬 {t('stripRight')}</span>
        </div>
      </div>
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex min-h-[68px] w-full max-w-page items-center gap-2.5 px-[18px] sm:min-h-[76px] sm:gap-[25px] sm:px-[22px]">
          <Link
            href="/"
            className="flex shrink-0 items-center"
            aria-label={`${b('name')} — ${t('home')}`}
          >
            <Image
              src="/brand/logo.png"
              alt={b('name')}
              width={120}
              height={60}
              priority
              className="h-10 w-auto sm:h-12"
            />
          </Link>
          <SearchBox />
          <HeaderTools />
        </div>
        <nav
          aria-label={t('menu')}
          className="mx-auto hidden min-h-[43px] w-full max-w-page items-center gap-[25px] overflow-x-auto px-[22px] md:flex"
        >
          <Link href="/" className={NAV_LINK}>
            {t('home')}
          </Link>
          <Link href="/danh-muc" className={NAV_LINK}>
            {t('products')}
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/danh-muc?category=${encodeURIComponent(c.slug)}`}
              className={NAV_LINK}
            >
              {c.name}
            </Link>
          ))}
          <span className="ml-auto whitespace-nowrap text-[12px] font-semibold text-green">
            ✦ {t('announcement')}
          </span>
        </nav>
        {/* tablet/mobile: horizontally scrollable strip (prototype .mobile-menu) */}
        <nav
          aria-label={t('menu')}
          className="flex gap-[15px] overflow-x-auto bg-[#f1f8f2] px-[18px] py-[9px] md:hidden"
        >
          <Link
            href="/danh-muc"
            className="inline-flex min-h-[32px] items-center whitespace-nowrap text-[11px] font-bold text-green"
          >
            {t('allCategories')}
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/danh-muc?category=${encodeURIComponent(c.slug)}`}
              className="inline-flex min-h-[32px] items-center whitespace-nowrap text-[11px] font-bold text-green"
            >
              {c.name}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}
