import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { PublicCategory } from '@bizgo/contracts';

/** Group icons come from the prototype CATS; keyed by slug so a reorder in the DB cannot mismatch them. */
const ICONS: Record<string, string> = {
  'bot-nau-che-tinh-bot': '🌾',
  'cui-buoi-phu-lieu': '🍊',
  'com-sen-duong': '🌿',
  'cac-loai-dau-hat': '🫘',
  'khoai-deo-mochi': '🍡',
  'do-an-vat': '🍟',
  'tran-chau-topping': '🧋',
  'kem-beo-cot-dua': '🥥',
};

export async function CategoryGrid({ categories }: { categories: PublicCategory[] }) {
  const t = await getTranslations('home');
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 md:grid-cols-4 md:gap-3.5">
      {categories.map((c) => (
        <li key={c.id}>
          <Link
            href={`/danh-muc?category=${encodeURIComponent(c.slug)}`}
            className="flex min-h-[78px] items-center gap-2.5 rounded-2xl border border-line bg-gradient-to-br from-[#f6fbf3] to-white p-2.5 hover:border-[#9fceb0] hover:shadow-card sm:min-h-[97px] sm:gap-4 sm:p-5"
          >
            <span
              aria-hidden="true"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-[#e4f5e5] text-2xl sm:h-14 sm:w-14 sm:text-3xl"
            >
              {ICONS[c.slug] ?? '🌿'}
            </span>
            <span>
              <strong className="block text-[13px] leading-snug">{c.name}</strong>
              <small className="mt-1 block text-xs text-muted">
                {t('categoryCount', { count: c.activeProductCount })}
              </small>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
