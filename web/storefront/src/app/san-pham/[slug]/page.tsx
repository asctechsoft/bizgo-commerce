import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ApiError, type PublicProduct, type PublicProductDetail } from '@bizgo/contracts';
import { AddToCart } from '@/components/AddToCart';
import { ImageZoom } from '@/components/ImageZoom';
import { PageHead } from '@/components/PageHead';
import { ProductGrid } from '@/components/ProductCard';
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

async function loadRelated(product: PublicProductDetail): Promise<PublicProduct[]> {
  try {
    const r = await serverApi().catalog.products({ category: product.category.slug, limit: 6 });
    return r.items.filter((p) => p.id !== product.id).slice(0, 4);
  } catch {
    return []; // related items are optional; the product itself loaded fine
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
  const related = await loadRelated(product);
  const t = await getTranslations('product');
  const c = await getTranslations('common');
  const buyable = product.variants.filter((v) => v.unitPriceVnd !== null);
  const hasDemo = buyable.some((v) => v.isTest);
  const alt = product.image?.isIllustrative
    ? `${product.name} (${c('illustrativeImage')})`
    : product.name;

  return (
    <div>
      <PageHead
        crumbs={[
          { label: product.category.name, href: `/danh-muc?category=${product.category.slug}` },
          { label: product.name },
        ]}
      />
      <div className="grid gap-[17px] md:grid-cols-2 md:gap-[38px]">
        <div>
          {product.image ? (
            <ImageZoom src={product.image.url} alt={alt} />
          ) : (
            <div className="grid h-[320px] place-items-center rounded-[22px] bg-gradient-to-br from-[#f2f7f0] to-white text-muted sm:h-[440px]">
              {c('noImage')}
            </div>
          )}
          {product.image?.isIllustrative ? (
            <p className="mt-[15px] rounded-[12px] border border-[#d0e9d7] bg-[#f1faf3] px-4 py-3 text-[11px] leading-[1.8] text-[#437451]">
              {t('illustrativeNotice')}
            </p>
          ) : null}
        </div>

        <div>
          <span className="inline-block rounded-lg bg-[#e8f6ec] px-2.5 py-[7px] text-[10px] font-bold text-green">
            {buyable.length > 0
              ? hasDemo
                ? t('statusDemo')
                : t('statusOnSale')
              : t('statusDraft')}
          </span>
          <h1 className="my-2.5 text-[23px] leading-[1.4] sm:text-[30px]">{product.name}</h1>
          <p className="m-0 text-[12px] leading-[1.8] text-muted">
            {t('refCode', { code: product.referenceCode })} · {t('category')}:{' '}
            {product.category.name}
          </p>

          {buyable.length > 0 ? (
            <AddToCart variants={buyable} slug={product.slug} />
          ) : (
            <>
              <p className="mt-5 text-lg font-extrabold text-orange-deep">
                {t('priceUnavailable')}
              </p>
              <div
                role="note"
                className="mt-4 rounded-card border border-[#f3d4b6] bg-[#fff4e5] p-4"
              >
                <strong className="block text-[14px]">{t('notForSale')}</strong>
                <p className="mb-0 mt-1 text-[13px]">{t('notForSaleText')}</p>
              </div>
            </>
          )}

          <p className="mt-[15px] rounded-[12px] border border-[#d0e9d7] bg-[#f1faf3] px-4 py-3 text-[11px] leading-[1.8] text-[#437451]">
            ⏱ {t('shippingNotice')}
          </p>

          <section className="mt-[38px]">
            <h2 className="mb-2 mt-0 text-[16px]">{t('infoTitle')}</h2>
            <p className="m-0 text-[12px] leading-[1.9] text-muted">
              {product.note ?? t('infoDefault')} {t('infoNeeds')}
            </p>
          </section>
        </div>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-h" className="mt-[38px]">
          <div className="mb-[19px] flex items-end justify-between gap-2.5">
            <h2 id="related-h" className="m-0 text-xl font-extrabold sm:text-2xl">
              {t('relatedTitle')}
            </h2>
            <Link
              href={`/danh-muc?category=${product.category.slug}`}
              className="whitespace-nowrap text-[12px] font-bold text-green"
            >
              {t('relatedMore')}
            </Link>
          </div>
          <ProductGrid products={related} />
        </section>
      ) : null}
    </div>
  );
}
