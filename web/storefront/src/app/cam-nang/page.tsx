import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@bizgo/ui-web';
import type { ArticleCategory } from '@bizgo/contracts';
import { ArticleCard, ArticleCover, CategoryTag, formatDate } from '@/components/ArticleParts';
import { NewsletterForm } from '@/components/NewsletterForm';
import { PageHead } from '@/components/PageHead';
import { serverApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

const CATEGORIES: ArticleCategory[] = ['RECIPE', 'INGREDIENT', 'BUSINESS', 'STORAGE', 'WHOLESALE'];
const PAGE_SIZE = 6;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('guides');
  return { title: t('title') };
}

function href(category: ArticleCategory | undefined, page: number): string {
  const q = new URLSearchParams();
  if (category) q.set('category', category);
  if (page > 1) q.set('page', String(page));
  const s = q.toString();
  return s ? `/cam-nang?${s}` : '/cam-nang';
}

/** 1 2 3 … N window around the current page. */
function pageWindow(current: number, pages: number): (number | '…')[] {
  const keep = new Set([1, pages, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  const nums = [...keep].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  nums.forEach((n, i) => {
    const prev = nums[i - 1];
    if (prev !== undefined && n - prev > 1) out.push('…');
    out.push(n);
  });
  return out;
}

export default async function GuidesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const category = CATEGORIES.find((c) => c === sp.category);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(sp.page ?? '1', 10) || 1));
  const t = await getTranslations('guides');
  const api = serverApi();
  const [list, featured, info] = await Promise.all([
    api.content.articles({ ...(category ? { category } : {}), page, limit: PAGE_SIZE }),
    api.content.articles({ featured: true, limit: 3 }),
    api.content.siteInfo(),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const hero = !category && page === 1 ? (featured.items[0] ?? list.items[0]) : undefined;
  const chip =
    'inline-flex min-h-[38px] items-center rounded-full border px-4 text-[13px] font-semibold transition';

  return (
    <div>
      <PageHead crumbs={[{ label: t('crumb') }]} title={t('title')} sub={t('sub')} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {hero ? (
            <Link
              href={`/cam-nang/${hero.slug}`}
              className="group grid overflow-hidden rounded-[18px] border border-line bg-gradient-to-br from-[#eef8ec] to-[#f6fbf3] shadow-card sm:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]"
            >
              <ArticleCover
                src={hero.coverImage}
                priority
                className="h-[200px] w-full sm:h-full sm:min-h-[260px]"
                sizes="(max-width: 680px) 100vw, 420px"
              />
              <div className="flex flex-col p-5 sm:p-6">
                <span>
                  <CategoryTag category={hero.category} />
                </span>
                <h2 className="m-0 mt-3 text-[20px] font-extrabold leading-snug group-hover:text-green sm:text-[24px]">
                  {hero.title}
                </h2>
                <p className="m-0 mt-2 text-[13px] leading-relaxed text-muted">{hero.excerpt}</p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
                  <p className="m-0 flex items-center gap-4 text-xs text-muted">
                    <span>🕒 {t('minutes', { n: hero.readMinutes })}</span>
                    <time dateTime={hero.publishedAt ?? undefined}>
                      🗓 {formatDate(hero.publishedAt)}
                    </time>
                  </p>
                  <span className="inline-flex min-h-tap items-center rounded-control bg-green px-5 text-[13px] font-bold text-white group-hover:bg-green-deep">
                    {t('readNow')} →
                  </span>
                </div>
              </div>
            </Link>
          ) : null}

          <nav aria-label={t('filterLabel')} className="mt-5 flex flex-wrap gap-2.5">
            <Link
              href="/cam-nang"
              aria-current={!category ? 'true' : undefined}
              className={`${chip} ${!category ? 'border-green bg-green text-white' : 'border-line bg-white hover:border-[#9fceb0]'}`}
            >
              {t('filterAll')}
            </Link>
            {CATEGORIES.map((c) => (
              <Link
                key={c}
                href={href(c, 1)}
                aria-current={category === c ? 'true' : undefined}
                className={`${chip} ${category === c ? 'border-green bg-green text-white' : 'border-line bg-white hover:border-[#9fceb0]'}`}
              >
                {t(`categories.${c}`)}
              </Link>
            ))}
          </nav>

          {list.items.length > 0 ? (
            <ul className="m-0 mt-5 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {list.items.map((a) => (
                <ArticleCard key={a.id} a={a} />
              ))}
            </ul>
          ) : (
            <div className="mt-5">
              <EmptyState title={t('emptyTitle')} description={t('emptyText')} icon="📖" />
            </div>
          )}

          {pages > 1 ? (
            <nav
              aria-label={t('pagination')}
              className="mt-6 flex flex-wrap items-center justify-center gap-2"
            >
              {page > 1 ? (
                <Link
                  rel="prev"
                  href={href(category, page - 1)}
                  aria-label={t('prev')}
                  className="grid h-9 w-9 place-items-center rounded-full border border-line text-sm hover:bg-green-mint"
                >
                  ‹
                </Link>
              ) : null}
              {pageWindow(page, pages).map((n, i) =>
                n === '…' ? (
                  <span key={`gap${i}`} aria-hidden="true" className="px-1 text-muted">
                    …
                  </span>
                ) : (
                  <Link
                    key={n}
                    href={href(category, n)}
                    aria-current={n === page ? 'page' : undefined}
                    className={`grid h-9 min-w-9 place-items-center rounded-full border px-2 text-[13px] font-bold ${n === page ? 'border-green bg-green text-white' : 'border-line hover:bg-green-mint'}`}
                  >
                    {n}
                  </Link>
                ),
              )}
              {page < pages ? (
                <Link
                  rel="next"
                  href={href(category, page + 1)}
                  aria-label={t('next')}
                  className="grid h-9 w-9 place-items-center rounded-full border border-line text-sm hover:bg-green-mint"
                >
                  ›
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>

        <aside className="space-y-5" aria-label={t('featuredTitle')}>
          {featured.items.length > 0 ? (
            <section className="rounded-[18px] bg-[#f1f8f2] p-4">
              <h2 className="m-0 text-[17px] font-extrabold">
                <span aria-hidden="true">🔥 </span>
                {t('featuredTitle')}
              </h2>
              <ul className="m-0 mt-3 list-none space-y-2.5 p-0">
                {featured.items.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/cam-nang/${a.slug}`}
                      className="group flex gap-3 rounded-[12px] bg-white p-2.5 hover:shadow-card"
                    >
                      <ArticleCover
                        src={a.coverImage}
                        className="h-[68px] w-[84px] shrink-0 rounded-[10px]"
                        sizes="84px"
                      />
                      <div className="min-w-0">
                        <p className="m-0 line-clamp-2 text-[13px] font-extrabold leading-snug group-hover:text-green">
                          {a.title}
                        </p>
                        <p className="m-0 mt-1 text-[11px] text-muted">
                          🕒 {t('minutes', { n: a.readMinutes })}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {info.guideTips.length > 0 ? (
            <section className="rounded-[18px] bg-[#f1f8f2] p-4">
              <h2 className="m-0 text-[17px] font-extrabold">
                <span aria-hidden="true">💡 </span>
                {t('tipsTitle')}
              </h2>
              <ul className="m-0 mt-3 list-none space-y-2.5 p-0">
                {info.guideTips.map((tip) => (
                  <li key={tip} className="flex gap-3 rounded-[12px] bg-white p-3 text-[13px]">
                    <span
                      aria-hidden="true"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#cdeccf] text-[12px] font-bold text-[#1f6b3a]"
                    >
                      ✓
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      <section
        aria-labelledby="guides-news"
        className="relative mt-8 flex flex-col gap-4 overflow-hidden rounded-[18px] bg-gradient-to-r from-[#e6f6e4] to-[#f3faf0] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="text-5xl">
            ✉️
          </span>
          <div>
            <h2 id="guides-news" className="m-0 text-[18px] font-extrabold text-[#133e24]">
              {t('newsletterTitle')}
            </h2>
            <p className="m-0 mt-1 max-w-[520px] text-xs text-muted">{t('newsletterText')}</p>
          </div>
        </div>
        <NewsletterForm />
      </section>
    </div>
  );
}
