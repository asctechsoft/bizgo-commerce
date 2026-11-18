import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/** Prototype `.crumb` + `.page-title` + `.sub` block shared by inner pages. */
export async function PageHead({
  crumbs,
  title,
  sub,
}: {
  crumbs: Array<{ label: string; href?: string }>;
  title?: string;
  sub?: string;
}) {
  const t = await getTranslations('common');
  return (
    <>
      <nav aria-label="breadcrumb" className="my-[27px] text-[11px] text-[#89998d]">
        <ol className="m-0 flex list-none flex-wrap items-center gap-[9px] p-0">
          <li>
            <Link href="/" className="hover:text-green">
              {t('home')}
            </Link>
          </li>
          {crumbs.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-[9px]">
              <span aria-hidden="true">›</span>
              {c.href ? (
                <Link href={c.href} className="hover:text-green">
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      {title ? (
        <h1 className="mb-3 mt-2 text-[22px] font-extrabold tracking-[-0.7px] sm:text-[28px]">
          {title}
        </h1>
      ) : null}
      {sub ? <p className="m-0 text-[12px] leading-[1.8] text-muted">{sub}</p> : null}
    </>
  );
}
