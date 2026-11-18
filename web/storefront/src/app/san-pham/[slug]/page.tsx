import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ApiError, type PublicProductDetail } from '@bizgo/contracts';
import { serverApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

async function load(slug: string): Promise<PublicProductDetail> {
  try {
    return await serverApi().catalog.product(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e; // real failures reach error.tsx
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const p = await serverApi().catalog.product(slug);
    return { title: p.name, alternates: { canonical: `/san-pham/${p.slug}` } };
  } catch {
    return {};
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await load(slug);
  const t = await getTranslations('product');
  const c = await getTranslations('common');
  return (
    <div className="pt-6">
      <nav aria-label="breadcrumb" className="text-xs text-muted">
        <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          <li>
            <Link href="/" className="hover:text-green">
              {t('breadcrumbHome')}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/danh-muc?category=${product.category.slug}`} className="hover:text-green">
              {product.category.name}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-semibold text-ink">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="mt-5 grid gap-6 md:grid-cols-2 md:gap-10">
        <div className="relative grid min-h-[320px] place-items-center overflow-hidden rounded-card border border-line bg-gradient-to-br from-green-soft to-white md:min-h-[460px]">
          {product.image ? (
            <Image
              src={product.image.url}
              alt={
                product.image.isIllustrative
                  ? `${product.name} (${c('illustrativeImage')})`
                  : product.name
              }
              fill
              priority
              sizes="(max-width: 980px) 100vw, 50vw"
              className="object-contain p-6"
            />
          ) : (
            <span className="text-muted">{c('noImage')}</span>
          )}
        </div>
        <div>
          <h1 className="m-0 text-2xl font-extrabold md:text-[30px]">{product.name}</h1>
          <p className="mt-2 text-[13px] text-muted">
            {t('category')}: {product.category.name}
          </p>
          {product.note ? <p className="mt-3 text-[13px]">{product.note}</p> : null}
          <p className="mt-5 text-lg font-extrabold text-orange-deep">{t('priceUnavailable')}</p>
          <div role="note" className="mt-4 rounded-card border border-[#f3d4b6] bg-[#fff4e5] p-4">
            <strong className="block text-[14px]">{t('notForSale')}</strong>
            <p className="mb-0 mt-1 text-[13px]">{t('notForSaleText')}</p>
          </div>
          {product.image?.isIllustrative ? (
            <p className="mt-4 text-xs text-muted">{t('illustrativeNotice')}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
