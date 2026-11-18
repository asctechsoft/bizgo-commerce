import type { MetadataRoute } from 'next';
import { serverApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Only ACTIVE (publicly sellable) products are indexed — never DRAFT (Spec §10.1 SEO). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const entries: MetadataRoute.Sitemap = [
    { url: `${site}/`, changeFrequency: 'daily' },
    { url: `${site}/danh-muc`, changeFrequency: 'daily' },
  ];
  try {
    const api = serverApi();
    for (let page = 1; page <= 20; page++) {
      const r = await api.catalog.products({ page, limit: 100 });
      for (const p of r.items)
        entries.push({ url: `${site}/san-pham/${p.slug}`, changeFrequency: 'weekly' });
      if (page * 100 >= r.total) break;
    }
  } catch {
    // API unavailable: serve the static entries only.
  }
  return entries;
}
