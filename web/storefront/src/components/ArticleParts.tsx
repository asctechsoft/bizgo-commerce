import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import type { ArticleCategory, ArticleSummary } from '@bizgo/contracts';

/** Cover on a warm backdrop: article art is mostly cut-out food photography, so it is contained, not cropped. */
export function ArticleCover({
  src,
  className = '',
  sizes,
  priority = false,
}: {
  src: string | null;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  const frame = `relative overflow-hidden bg-gradient-to-br from-[#f7efdf] via-[#f3e8d2] to-[#eadcc0] ${className}`;
  if (!src) {
    return (
      <div className={`${frame} grid place-items-center`} aria-hidden="true">
        <span className="text-5xl opacity-70">🍵</span>
      </div>
    );
  }
  return (
    <div className={frame}>
      {src.startsWith('/') ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          className="object-contain p-2"
        />
      ) : (
        // Remote covers (https) are not in next/image's allow-list; plain <img> keeps them working.
        <img
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-contain p-2"
        />
      )}
    </div>
  );
}

export async function CategoryTag({ category }: { category: ArticleCategory }) {
  const t = await getTranslations('guides.categories');
  return (
    <span className="inline-block rounded-md bg-[#e4f4e6] px-2 py-1 text-[11px] font-bold text-[#1f6b3a]">
      {t(category)}
    </span>
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso));
}

export async function ArticleCard({ a }: { a: ArticleSummary }) {
  const t = await getTranslations('guides');
  return (
    <li>
      <Link
        href={`/cam-nang/${a.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-[15px] border border-line bg-white transition hover:border-[#9fceb0] hover:shadow-card"
      >
        <div className="relative">
          <ArticleCover
            src={a.coverImage}
            className="h-[130px] w-full"
            sizes="(max-width: 680px) 100vw, (max-width: 1200px) 33vw, 300px"
          />
          <span className="absolute bottom-2 left-2">
            <CategoryTag category={a.category} />
          </span>
        </div>
        <div className="flex flex-1 flex-col p-3.5">
          <h3 className="m-0 text-[14px] font-extrabold leading-snug group-hover:text-green">
            {a.title}
          </h3>
          <p className="m-0 mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{a.excerpt}</p>
          <p className="m-0 mt-auto flex items-center gap-4 pt-3 text-[11px] text-muted">
            <span>🕒 {t('minutes', { n: a.readMinutes })}</span>
            <time dateTime={a.publishedAt ?? undefined}>🗓 {formatDate(a.publishedAt)}</time>
          </p>
        </div>
      </Link>
    </li>
  );
}

/**
 * Safe renderer for the article body format (blank line = paragraph, "## " = heading, "- " = bullet).
 * No HTML is ever interpreted, so admin-entered text cannot inject markup.
 */
export function ArticleBody({ body }: { body: string }) {
  const blocks = body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const out: ReactNode[] = [];
  blocks.forEach((block, i) => {
    const lines = block.split('\n');
    if (lines[0]?.startsWith('## ')) {
      out.push(
        <h2 key={`h${i}`} className="m-0 mb-2 mt-7 text-[19px] font-extrabold text-ink">
          {lines[0].slice(3).trim()}
        </h2>,
      );
      lines.shift();
      if (lines.length === 0) return;
    }
    const text = lines.join('\n');
    if (lines.every((l) => l.startsWith('- '))) {
      out.push(
        <ul key={`u${i}`} className="my-3 list-disc space-y-1.5 pl-5">
          {lines.map((l) => (
            <li key={l}>{l.slice(2).trim()}</li>
          ))}
        </ul>,
      );
    } else {
      out.push(
        <p key={`p${i}`} className="my-3 whitespace-pre-line">
          {text}
        </p>,
      );
    }
  });
  return <div className="text-[15px] leading-[1.8] text-[#2c3d33]">{out}</div>;
}
