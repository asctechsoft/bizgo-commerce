import type { MetadataRoute } from 'next';
import { serverApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Only ACTIVE (publicly sellable) products are indexed — never DRAFT (Spec §10.1 SEO). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const entries: MetadataRoute.Sitemap = [
    { url: `${site}/`, changeFrequency: 'daily' },
    { url: `${site}/danh-muc`, changeFrequency: 'daily' },
    { url: `${site}/nguon-hang-tu-xuong`, changeFrequency: 'monthly' },
    { url: `${site}/van-chuyen-theo-dieu-kien-bao-quan`, changeFrequency: 'monthly' },
    { url: `${site}/nguyen-lieu-da-dang`, changeFrequency: 'weekly' },
    { url: `${site}/chi-ban-hang-da-xac-minh`, changeFrequency: 'weekly' },
    { url: `${site}/mua-si`, changeFrequency: 'monthly' },
    { url: `${site}/cam-nang`, changeFrequency: 'weekly' },
    { url: `${site}/lien-he`, changeFrequency: 'monthly' },
  ];
  try {
    const api = serverApi();
    for (let page = 1; page <= 20; page++) {
      const r = await api.catalog.products({ page, limit: 100 });
      for (const p of r.items)
        entries.push({ url: `${site}/san-pham/${p.slug}`, changeFrequency: 'weekly' });
      if (page * 100 >= r.total) break;
    }
    for (let page = 1; page <= 20; page++) {
      const r = await api.content.articles({ page, limit: 50 });
      for (const a of r.items)
        entries.push({ url: `${site}/cam-nang/${a.slug}`, changeFrequency: 'monthly' });
      if (page * 50 >= r.total) break;
    }
  } catch {
    // API unavailable: serve the static entries only.
  }
  return entries;
}
