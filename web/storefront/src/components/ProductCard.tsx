import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { PublicProduct } from '@bizgo/contracts';

/** Image area uses object-contain on a neutral surface (no mix-blend-mode; prototype issue P06). */
export async function ProductCard({ product }: { product: PublicProduct }) {
  const t = await getTranslations('common');
  const p = await getTranslations('product');
  return (
    <article className="flex flex-col overflow-hidden rounded-[17px] border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-card">
      <Link href={`/san-pham/${product.slug}`} className="block" aria-label={product.name}>
        <div className="relative grid h-40 place-items-center bg-gradient-to-br from-green-soft to-white sm:h-[205px]">
          {product.image ? (
            <Image
              src={product.image.url}
              alt={
                product.image.isIllustrative
                  ? `${product.name} (${t('illustrativeImage')})`
                  : product.name
              }
              fill
              sizes="(max-width: 680px) 50vw, (max-width: 1200px) 33vw, 25vw"
              className="object-contain p-4"
            />
          ) : (
            <span className="text-sm text-muted">{t('noImage')}</span>
          )}
          {product.image?.isIllustrative ? (
            <span className="absolute left-3 top-3 rounded-md bg-green-mint px-2 py-1 text-[11px] font-bold text-green">
              {t('illustrativeImage')}
            </span>
          ) : null}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <h3 className="m-0 min-h-[40px] text-[13px] font-semibold leading-snug">
          <Link href={`/san-pham/${product.slug}`} className="hover:text-green">
            {product.name}
          </Link>
        </h3>
        <p className="m-0 text-xs text-muted">{product.category.name}</p>
        <p className="m-0 mt-auto text-[13px] font-bold text-orange-deep">
          {p('priceUnavailable')}
        </p>
      </div>
    </article>
  );
}

export async function ProductGrid({ products }: { products: PublicProduct[] }) {
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id}>
          <ProductCard product={p} />
        </li>
      ))}
    </ul>
  );
}
