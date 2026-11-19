import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { btnOutline } from '@/components/InfoHero';
import { InquiryForm } from '@/components/InquiryForm';
import { PageHead } from '@/components/PageHead';
import { serverApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contact');
  return { title: t('title') };
}

function InfoRow({
  icon,
  label,
  note,
  children,
}: {
  icon: string;
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#dff1df] text-lg"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="m-0 text-[12px] font-extrabold">{label}</p>
        <div className="text-[15px] font-bold leading-snug text-orange-deep">{children}</div>
        {note ? <p className="m-0 text-[11px] text-muted">{note}</p> : null}
      </div>
    </li>
  );
}

const SOCIALS = [
  { key: 'facebook', label: 'socialFacebook', mark: 'f', bg: '#1877f2' },
  { key: 'zalo', label: 'socialZalo', mark: 'Zalo', bg: '#0068ff' },
  { key: 'youtube', label: 'socialYoutube', mark: '▶', bg: '#e62117' },
  { key: 'tiktok', label: 'socialTiktok', mark: '♪', bg: '#111111' },
] as const;

export default async function ContactPage() {
  const c = await getTranslations('contact');
  const receive = c.raw('receive') as { label: string; text: string }[];
  const faq = c.raw('faq') as { q: string; a: string }[];
  // Contact details are owner-managed data: nothing is shown (or invented) for fields that are not configured.
  const { contact } = await serverApi().content.siteInfo();
  const social = SOCIALS.filter((s) => contact.social[s.key]);
  const chatUrl = contact.social.zalo ?? contact.social.facebook;
  const hasInfo = !!(contact.hotline || contact.email || contact.hours || contact.address);
  const telHref = contact.hotline ? `tel:${contact.hotline.replace(/[^\d+]/g, '')}` : null;

  return (
    <div>
      <PageHead crumbs={[{ label: c('crumb') }]} title={c('title')} sub={c('sub')} />

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <section aria-labelledby="contact-form" className="rounded-[18px] bg-[#f4f9f3] p-5 sm:p-6">
          <h2
            id="contact-form"
            className="m-0 flex items-center gap-2.5 text-[20px] font-extrabold"
          >
            <span aria-hidden="true" className="text-green">
              ✉
            </span>
            {c('formTitle')}
          </h2>
          <p className="m-0 mb-5 mt-1 text-xs text-muted">{c('formSub')}</p>
          <InquiryForm kind="CONTACT" />
        </section>

        <section
          aria-labelledby="contact-info"
          className="relative overflow-hidden rounded-[18px] bg-[#f4f9f3] p-5 sm:p-6"
        >
          <h2
            id="contact-info"
            className="m-0 flex items-center gap-2.5 text-[20px] font-extrabold"
          >
            <span aria-hidden="true" className="text-green">
              ☎
            </span>
            {c('infoTitle')}
          </h2>
          <p className="m-0 mt-1 text-xs text-muted">{c('infoSub')}</p>
          <div className="mt-5 grid items-end gap-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div>
              {hasInfo ? (
                <ul className="m-0 list-none space-y-4 p-0">
                  {contact.hotline && telHref ? (
                    <InfoRow icon="📞" label={c('hotline')} note={c('hotlineNote')}>
                      <a href={telHref} className="hover:underline">
                        {contact.hotline}
                      </a>
                    </InfoRow>
                  ) : null}
                  {contact.email ? (
                    <InfoRow icon="✉️" label={c('email')} note={c('emailNote')}>
                      <a href={`mailto:${contact.email}`} className="break-all hover:underline">
                        {contact.email}
                      </a>
                    </InfoRow>
                  ) : null}
                  {contact.hours ? (
                    <InfoRow icon="🕒" label={c('hours')}>
                      {contact.hours}
                    </InfoRow>
                  ) : null}
                  {contact.address ? (
                    <InfoRow
                      icon="📍"
                      label={c('address')}
                      {...(contact.addressNote ? { note: contact.addressNote } : {})}
                    >
                      {contact.address}
                    </InfoRow>
                  ) : null}
                </ul>
              ) : (
                <p className="m-0 rounded-control bg-white p-4 text-[13px] text-muted">
                  {c('infoEmpty')}
                </p>
              )}
              {social.length > 0 ? (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="m-0 text-[13px] font-extrabold">{c('social')}</p>
                  <ul className="m-0 mt-2.5 flex list-none gap-3 p-0">
                    {social.map((s) => (
                      <li key={s.key}>
                        <a
                          href={contact.social[s.key] ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={c(s.label)}
                          style={{ background: s.bg }}
                          className="grid h-10 w-10 place-items-center rounded-full text-[11px] font-extrabold text-white"
                        >
                          {s.mark}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="relative mx-auto hidden h-[300px] w-full max-w-[260px] sm:block">
              <Image
                src="/blog/img_contact_agent.png"
                alt=""
                fill
                sizes="260px"
                className="object-contain object-bottom"
              />
            </div>
          </div>
        </section>
      </div>

      <section
        aria-labelledby="contact-area"
        className="mt-5 grid overflow-hidden rounded-[18px] bg-[#f4f9f3] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.1fr)]"
      >
        <div className="relative hidden min-h-[170px] md:block">
          <Image
            src="/blog/img_contact_map.png"
            alt=""
            fill
            sizes="(max-width: 980px) 0px, 320px"
            className="object-contain"
          />
        </div>
        <div className="p-5 sm:p-6">
          <h2 id="contact-area" className="m-0 flex items-center gap-2 text-[17px] font-extrabold">
            <span aria-hidden="true" className="text-green">
              📍
            </span>
            {c('areaTitle')}
          </h2>
          <p className="m-0 mt-2 text-[13px] leading-relaxed text-muted">{c('areaText')}</p>
          <Link
            href="/van-chuyen-theo-dieu-kien-bao-quan"
            className="mt-3 inline-block text-[13px] font-bold text-green hover:underline"
          >
            {c('areaLink')} →
          </Link>
        </div>
        <div className="border-line p-5 sm:p-6 md:border-l">
          <h2 className="m-0 flex items-center gap-2 text-[17px] font-extrabold">
            <span aria-hidden="true" className="text-green">
              📦
            </span>
            {c('receiveTitle')}
          </h2>
          <ul className="m-0 mt-3 list-none space-y-2 p-0 text-[13px]">
            {receive.map((r) => (
              <li key={r.label} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#2f9e4f] text-[11px] font-bold text-white"
                >
                  ✓
                </span>
                <span>
                  <strong>{r.label}</strong> <span className="text-muted">{r.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="contact-quick" className="mt-7">
        <h2 id="contact-quick" className="m-0 flex items-center gap-2 text-[20px] font-extrabold">
          <span aria-hidden="true" className="text-orange">
            ⚡
          </span>
          {c('quickTitle')}
        </h2>
        <p className="m-0 mt-1 text-[13px] text-muted">{c('quickSub')}</p>
        <ul className="m-0 mt-4 grid list-none gap-3 p-0 md:grid-cols-3">
          {chatUrl ? (
            <li className="flex items-center gap-4 rounded-[15px] bg-[#f1f8f2] p-4">
              <span aria-hidden="true" className="text-3xl">
                💬
              </span>
              <div className="min-w-0">
                <p className="m-0 text-[14px] font-extrabold">{c('chatTitle')}</p>
                <p className="m-0 mb-2 text-xs text-muted">{c('chatText')}</p>
                <a href={chatUrl} target="_blank" rel="noopener noreferrer" className={btnOutline}>
                  {c('chatCta')} →
                </a>
              </div>
            </li>
          ) : null}
          {contact.hotline && telHref ? (
            <li className="flex items-center gap-4 rounded-[15px] bg-[#fff4ea] p-4">
              <span aria-hidden="true" className="text-3xl">
                📞
              </span>
              <div className="min-w-0">
                <p className="m-0 text-[14px] font-extrabold">{c('callTitle')}</p>
                <p className="m-0 mb-2 text-xs text-muted">{c('callText')}</p>
                <a
                  href={telHref}
                  className="inline-flex min-h-tap items-center rounded-control border border-orange bg-white px-5 text-[13px] font-bold text-orange-deep hover:bg-[#fff1e6]"
                >
                  {contact.hotline}
                </a>
              </div>
            </li>
          ) : null}
          <li className="flex items-center gap-4 rounded-[15px] bg-[#f1f8f2] p-4">
            <span aria-hidden="true" className="text-3xl">
              🧾
            </span>
            <div className="min-w-0">
              <p className="m-0 text-[14px] font-extrabold">{c('quoteTitle')}</p>
              <p className="m-0 mb-2 text-xs text-muted">{c('quoteText')}</p>
              <Link href="/mua-si#quote" className={btnOutline}>
                {c('quoteCta')} →
              </Link>
            </div>
          </li>
        </ul>
      </section>

      <section
        aria-labelledby="contact-faq"
        className="mt-7 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]"
      >
        <div>
          <h2 id="contact-faq" className="m-0 flex items-center gap-2 text-[19px] font-extrabold">
            <span
              aria-hidden="true"
              className="grid h-7 w-7 place-items-center rounded-full bg-green text-sm text-white"
            >
              ?
            </span>
            {c('faqTitle')}
          </h2>
          <p className="m-0 mt-2 text-[13px] text-muted">{c('faqSub')}</p>
        </div>
        <div className="space-y-2">
          {faq.map((f) => (
            <details
              key={f.q}
              className="group rounded-[11px] border border-line bg-white px-4 py-3 text-[13px]"
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
