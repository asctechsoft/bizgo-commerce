import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ApiError } from '@bizgo/contracts';
import {
  ArticleBody,
  ArticleCard,
  ArticleCover,
  CategoryTag,
  formatDate,
} from '@/components/ArticleParts';
import { PageHead } from '@/components/PageHead';
import { serverApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

async function load(slug: string) {
  try {
    return await serverApi().content.article(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e; // real failures reach the error boundary instead of looking like "not found"
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const a = await load((await params).slug);
  return a
    ? { title: a.title, description: a.excerpt }
    : { title: (await getTranslations('guides'))('notFound') };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = await load((await params).slug);
  if (!a) notFound();
  const t = await getTranslations('guides');
  return (
    <article>
      <PageHead crumbs={[{ label: t('crumb'), href: '/cam-nang' }, { label: a.title }]} />
      <div className="mx-auto max-w-[780px]">
        <CategoryTag category={a.category} />
        <h1 className="my-3 text-[26px] font-extrabold leading-tight sm:text-[34px]">{a.title}</h1>
        <p className="m-0 flex flex-wrap items-center gap-4 text-xs text-muted">
          <span>🕒 {t('minutes', { n: a.readMinutes })}</span>
          <time dateTime={a.publishedAt ?? undefined}>🗓 {formatDate(a.publishedAt)}</time>
        </p>
        <ArticleCover
          src={a.coverImage}
          priority
          className="mt-5 h-[220px] w-full rounded-[18px] sm:h-[340px]"
          sizes="(max-width: 780px) 100vw, 780px"
        />
        <p className="mt-6 text-[16px] font-semibold leading-relaxed text-[#2c3d33]">{a.excerpt}</p>
        <ArticleBody body={a.body} />
        <p className="mt-8">
          <Link href="/cam-nang" className="text-[13px] font-bold text-green">
            ← {t('back')}
          </Link>
        </p>
      </div>
      {a.related.length > 0 ? (
        <section aria-labelledby="related" className="mt-10">
          <h2 id="related" className="m-0 text-[19px] font-extrabold">
            {t('related')}
          </h2>
          <ul className="m-0 mt-4 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {a.related.map((r) => (
              <ArticleCard key={r.id} a={r} />
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
