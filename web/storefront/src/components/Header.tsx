import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { PublicCategory } from '@bizgo/contracts';
import { serverApi } from '@/lib/api';
import { SearchBox } from './SearchBox';

async function loadCategories(): Promise<PublicCategory[]> {
  try {
    return await serverApi().catalog.categories();
  } catch {
    return []; // the page body shows the real error state; the header must not crash the layout
  }
}

export async function Header() {
  const t = await getTranslations('header');
  const b = await getTranslations('brand');
  const categories = await loadCategories();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white">
      <div className="mx-auto flex min-h-[68px] w-full max-w-page items-center gap-3 px-[18px] sm:min-h-[76px] sm:gap-6 sm:px-[22px]">
        <Link
          href="/"
          className="flex shrink-0 items-center"
          aria-label={`${b('name')} — ${t('allCategories')}`}
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
        <nav
          aria-label={t('mainNav')}
          className="ml-auto hidden shrink-0 items-center gap-2 sm:flex"
        >
          <Link
            href="/dang-nhap"
            className="inline-flex min-h-tap items-center rounded-control px-3 text-[13px] font-semibold text-ink hover:bg-green-mint hover:text-green"
          >
            <span aria-hidden="true" className="mr-1.5 text-lg">
              👤
            </span>
            {t('login')}
          </Link>
        </nav>
      </div>
      <nav
        aria-label={t('menu')}
        className="mx-auto hidden w-full max-w-page items-center gap-6 overflow-x-auto px-[22px] md:flex"
      >
        <Link
          href="/danh-muc"
          className="whitespace-nowrap py-3 text-[13px] font-semibold text-ink hover:text-green"
        >
          {t('allCategories')}
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/danh-muc?category=${encodeURIComponent(c.slug)}`}
            className="whitespace-nowrap py-3 text-[13px] font-semibold text-ink hover:text-green"
          >
            {c.name}
          </Link>
        ))}
      </nav>
      {/* tablet/mobile: horizontally scrollable category strip (prototype .mobile-menu) */}
      <nav
        aria-label={t('menu')}
        className="flex gap-4 overflow-x-auto bg-green-mint px-[18px] py-2.5 md:hidden"
      >
        <Link
          href="/danh-muc"
          className="inline-flex min-h-[32px] items-center whitespace-nowrap text-xs font-bold text-green"
        >
          {t('allCategories')}
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/danh-muc?category=${encodeURIComponent(c.slug)}`}
            className="inline-flex min-h-[32px] items-center whitespace-nowrap text-xs font-bold text-green"
          >
            {c.name}
          </Link>
        ))}
      </nav>
    </header>
  );
}
