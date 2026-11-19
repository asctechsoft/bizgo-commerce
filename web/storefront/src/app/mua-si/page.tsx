import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@bizgo/ui-web';
import { btnOutline, btnPrimary, IconTile, InfoHero, SectionTitle } from '@/components/InfoHero';
import { InquiryForm } from '@/components/InquiryForm';
import { PageHead } from '@/components/PageHead';
import { serverApi } from '@/lib/api';
import { formatVnd } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface Item {
  icon: string;
  title: string;
  text: string;
}

const TIER_ICONS = ['🌱', '⭐', '👑'] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('wholesale');
  return { title: t('title') };
}

export default async function WholesalePage() {
  const w = await getTranslations('wholesale');
  const benefits = w.raw('benefits') as Item[];
  const steps = w.raw('steps') as Item[];
  const faq = w.raw('faq') as { q: string; a: string }[];
  // Tiers are owner-managed data (site settings). Nothing is invented when they are not configured.
  const info = await serverApi().content.siteInfo();
  const tiers = info.wholesaleTiers;

  return (
    <div>
      <PageHead crumbs={[{ label: w('crumb') }]} title={w('title')} />
      <div className="mt-4">
        <InfoHero
          as="h2"
          eyebrow={w('eyebrow')}
          title={w('heroTitle')}
          sub={w('heroSub')}
          image="/blog/hero_b2b_wholesale.png"
          actions={
            <>
              <Link href="/dang-ky" className={btnPrimary}>
                {w('ctaRegister')}
              </Link>
              <a
                href="#quote"
                className="inline-flex min-h-tap items-center rounded-control bg-orange-deep px-5 text-[13px] font-bold text-white hover:bg-[#a84609]"
              >
                {w('ctaQuote')}
              </a>
              <a href="#tiers" className={btnOutline}>
                {w('ctaTiers')}
              </a>
            </>
          }
        />
      </div>

      <ul className="m-0 mt-5 grid list-none gap-3 p-0 sm:grid-cols-2 md:grid-cols-4">
        {benefits.map((b) => (
          <li key={b.title} className="flex gap-3 rounded-[15px] border border-line bg-white p-4">
            <IconTile>{b.icon}</IconTile>
            <div>
              <p className="m-0 text-[13px] font-extrabold">{b.title}</p>
              <p className="m-0 mt-1 text-xs leading-relaxed text-muted">{b.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <SectionTitle id="b2b-process" title={w('processTitle')} />
      <ol
        aria-labelledby="b2b-process"
        className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 md:grid-cols-4"
      >
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 rounded-[15px] bg-[#f1f8f2] p-4">
            <span
              aria-hidden="true"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#cdeccf] text-[12px] font-extrabold text-[#1f6b3a]"
            >
              {i + 1}
            </span>
            <div>
              <p className="m-0 text-[13px] font-extrabold">
                <span aria-hidden="true" className="mr-1.5">
                  {s.icon}
                </span>
                {s.title}
              </p>
              <p className="m-0 mt-1 text-xs leading-relaxed text-muted">{s.text}</p>
            </div>
            {i < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute -right-[13px] top-1/2 z-10 hidden -translate-y-1/2 text-muted md:block"
              >
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="mt-9 grid gap-8 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section id="tiers" aria-labelledby="b2b-tiers" className="scroll-mt-28">
          <h2 id="b2b-tiers" className="m-0 text-[19px] font-extrabold sm:text-[22px]">
            {w('tiersTitle')}
          </h2>
          <p className="m-0 mt-1 text-[13px] text-muted">{w('tiersSub')}</p>
          {tiers.length > 0 ? (
            <ul className="m-0 mt-5 grid list-none gap-3 p-0 sm:grid-cols-3">
              {tiers.map((tier, i) => (
                <li
                  key={tier.key}
                  className={`relative rounded-[15px] border bg-white p-4 ${
                    tier.popular ? 'border-orange bg-[#fffaf5] shadow-card' : 'border-line'
                  }`}
                >
                  {tier.popular ? (
                    <span className="absolute -top-2.5 right-3 rounded-md bg-orange-deep px-2 py-0.5 text-[11px] font-bold text-white">
                      {w('popular')}
                    </span>
                  ) : null}
                  <div className="flex items-start gap-2">
                    <span aria-hidden="true" className="text-2xl">
                      {TIER_ICONS[i] ?? '🌱'}
                    </span>
                    <div>
                      <h3 className="m-0 text-[14px] font-extrabold">{tier.name}</h3>
                      {tier.audience ? (
                        <p className="m-0 text-[11px] text-muted">{tier.audience}</p>
                      ) : null}
                    </div>
                  </div>
                  <p className="m-0 mt-4 text-[13px] font-bold text-[#1d4a2e]">
                    {w('discountUpTo')}{' '}
                    <span
                      className={`text-[26px] font-extrabold ${
                        tier.popular ? 'text-orange-deep' : 'text-green'
                      }`}
                    >
                      {tier.discountPercent}%
                    </span>
                  </p>
                  <p className="m-0 mt-1 text-xs text-muted">
                    {w('minOrder', { amount: formatVnd(tier.minMonthlyVnd) ?? '' })}
                  </p>
                  {tier.perks.length > 0 ? (
                    <ul className="m-0 mt-3 list-none space-y-1.5 p-0 text-xs">
                      {tier.perks.map((p) => (
                        <li key={p} className="flex gap-1.5">
                          <span aria-hidden="true" className="font-bold text-green">
                            ✓
                          </span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-5">
              <EmptyState
                title={w('tiersEmptyTitle')}
                description={w('tiersEmptyText')}
                icon="🏷️"
              />
            </div>
          )}
        </section>

        <section
          id="quote"
          aria-labelledby="b2b-form"
          className="scroll-mt-28 border-line md:border-l md:pl-8"
        >
          <h2 id="b2b-form" className="m-0 text-[19px] font-extrabold sm:text-[22px]">
            {w('formTitle')}
          </h2>
          <p className="m-0 mb-4 mt-1 text-[13px] text-muted">{w('formSub')}</p>
          <InquiryForm kind="QUOTE" />
        </section>
      </div>

      <section
        aria-labelledby="b2b-faq"
        className="mt-9 grid gap-5 rounded-[20px] bg-gradient-to-r from-[#e6f6e4] to-[#f3faf0] p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]"
      >
        <div>
          <h2 id="b2b-faq" className="m-0 text-[19px] font-extrabold text-[#133e24] sm:text-[22px]">
            {w('faqTitle')}
          </h2>
          <p className="m-0 mt-2 text-[13px] text-muted">{w('faqSub')}</p>
        </div>
        <div className="space-y-2">
          {faq.map((f) => (
            <details
              key={f.q}
              className="group rounded-[11px] bg-white px-4 py-3 text-[13px] shadow-sm"
            >
              <summary className="flex min-h-[28px] cursor-pointer list-none items-center justify-between gap-3 font-bold">
                {f.q}
                <span aria-hidden="true" className="text-green transition group-open:rotate-180">
                  ⌄
                </span>
              </summary>
              <p className="m-0 mt-2 text-xs leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
