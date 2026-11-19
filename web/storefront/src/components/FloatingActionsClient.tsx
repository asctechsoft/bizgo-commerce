'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@bizgo/ui-web';
import { browserApi } from '@/lib/api';
import { ApiErrorBox } from './ApiErrorBox';

const PHONE_RE = /^(\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}$/;
const FAB =
  'grid h-12 w-12 place-items-center rounded-full shadow-[0_6px_18px_#0f2d1c33] transition hover:scale-105 focus-visible:scale-105';

interface Faq {
  q: string;
  a: string;
}
type Line = { from: 'bot' | 'user'; text: string };

export function FloatingActionsClient({ zaloUrl, faq }: { zaloUrl: string | null; faq: Faq[] }) {
  const t = useTranslations('chat');
  const [showTop, setShowTop] = useState(false);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ from: 'bot', text: t('greeting') }]);
  const [mode, setMode] = useState<'faq' | 'send' | 'sent'>('faq');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<unknown>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [lines, mode]);

  function toTop() {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
  }
  function close() {
    setOpen(false);
    opener.current?.focus();
  }
  function ask(f: Faq) {
    setLines((l) => [...l, { from: 'user', text: f.q }, { from: 'bot', text: f.a }]);
  }

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? '').trim();
    const p: Record<string, string> = {};
    if (!v('name')) p.name = t('required');
    if (!v('phone')) p.phone = t('required');
    else if (!PHONE_RE.test(v('phone'))) p.phone = t('phoneInvalid');
    if (v('message').length < 10) p.message = t('messageShort');
    if (f.get('consent') !== 'on') p.consent = t('consentRequired');
    setErrors(p);
    if (Object.keys(p).length) return;
    setBusy(true);
    setApiError(null);
    try {
      await browserApi().content.inquire({
        kind: 'CONTACT',
        fullName: v('name'),
        phone: v('phone'),
        message: v('message'),
        topic: 'PRODUCT_ADVICE',
        consent: true,
        website: v('website'),
      });
      setLines((l) => [
        ...l,
        { from: 'user', text: v('message') },
        { from: 'bot', text: t('sentText') },
      ]);
      setMode('sent');
    } catch (err) {
      setApiError(err);
    } finally {
      setBusy(false);
    }
  }

  const field =
    'min-h-tap w-full rounded-control border border-line bg-white px-3 text-[13px] placeholder:text-muted aria-[invalid=true]:border-danger';

  return (
    <div className="pointer-events-none fixed bottom-[84px] right-3 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-5">
      {open ? (
        <div
          ref={panel}
          role="dialog"
          aria-labelledby="chat-title"
          tabIndex={-1}
          onKeyDown={(e) => e.key === 'Escape' && close()}
          className="pointer-events-auto flex max-h-[min(560px,calc(100vh-170px))] w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-[18px] border border-line bg-white shadow-[0_18px_50px_#0f2d1c40] outline-none"
        >
          <div className="flex items-center justify-between gap-3 bg-green px-4 py-3 text-white">
            <div>
              <p id="chat-title" className="m-0 text-[14px] font-extrabold">
                {t('title')}
              </p>
              <p className="m-0 text-[11px] text-[#cfe9d6]">{t('subtitle')}</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t('close')}
              className="grid h-9 w-9 place-items-center rounded-full text-lg hover:bg-white/15"
            >
              ✕
            </button>
          </div>

          <div ref={log} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-[#f6faf5] p-3">
            {lines.map((l, i) => (
              <p
                key={i}
                className={`m-0 max-w-[88%] whitespace-pre-line rounded-[14px] px-3 py-2 text-[13px] leading-relaxed ${
                  l.from === 'bot'
                    ? 'rounded-bl-sm bg-white text-ink shadow-sm'
                    : 'ml-auto rounded-br-sm bg-green text-white'
                }`}
              >
                {l.text}
              </p>
            ))}
            {mode === 'faq' ? (
              <div>
                <p className="m-0 mb-1.5 text-[11px] font-semibold text-muted">{t('pick')}</p>
                <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                  {faq.map((f) => (
                    <li key={f.q}>
                      <button
                        type="button"
                        onClick={() => ask(f)}
                        className="min-h-[34px] rounded-full border border-[#9fceb0] bg-white px-3 py-1 text-left text-[12px] font-semibold text-green hover:bg-green-mint"
                      >
                        {f.q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="border-t border-line bg-white p-3">
            {mode === 'faq' ? (
              <>
                <p className="m-0 mb-2 text-[11px] leading-snug text-muted">{t('notAi')}</p>
                <Button className="w-full" onClick={() => setMode('send')}>
                  {t('sendOpen')}
                </Button>
              </>
            ) : null}
            {mode === 'sent' ? (
              <Button variant="secondary" className="w-full" onClick={() => setMode('faq')}>
                {t('backToFaq')}
              </Button>
            ) : null}
            {mode === 'send' ? (
              <form onSubmit={send} noValidate className="space-y-2">
                {apiError ? <ApiErrorBox error={apiError} /> : null}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>
                    Website
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>
                <div>
                  <input
                    name="name"
                    aria-label={t('name')}
                    placeholder={t('name')}
                    autoComplete="name"
                    maxLength={120}
                    aria-invalid={!!errors.name}
                    className={field}
                  />
                  {errors.name ? (
                    <p role="alert" className="m-0 mt-0.5 text-[11px] font-semibold text-danger">
                      {errors.name}
                    </p>
                  ) : null}
                </div>
                <div>
                  <input
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    aria-label={t('phone')}
                    placeholder={t('phone')}
                    autoComplete="tel"
                    maxLength={20}
                    aria-invalid={!!errors.phone}
                    className={field}
                  />
                  {errors.phone ? (
                    <p role="alert" className="m-0 mt-0.5 text-[11px] font-semibold text-danger">
                      {errors.phone}
                    </p>
                  ) : null}
                </div>
                <div>
                  <textarea
                    name="message"
                    rows={3}
                    maxLength={2000}
                    aria-label={t('question')}
                    placeholder={t('question')}
                    aria-invalid={!!errors.message}
                    className="w-full rounded-control border border-line bg-white px-3 py-2 text-[13px] placeholder:text-muted aria-[invalid=true]:border-danger"
                  />
                  {errors.message ? (
                    <p role="alert" className="m-0 mt-0.5 text-[11px] font-semibold text-danger">
                      {errors.message}
                    </p>
                  ) : null}
                </div>
                <label className="flex items-start gap-2 text-[11px] leading-snug">
                  <input type="checkbox" name="consent" className="mt-0.5 h-4 w-4 shrink-0" />
                  {t('consent')}
                </label>
                {errors.consent ? (
                  <p role="alert" className="m-0 text-[11px] font-semibold text-danger">
                    {errors.consent}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Button type="submit" loading={busy} className="flex-1">
                    {t('send')}
                  </Button>
                  <Button variant="secondary" onClick={() => setMode('faq')}>
                    {t('back')}
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-auto flex flex-col items-end gap-3">
        {showTop ? (
          <button
            type="button"
            onClick={toTop}
            aria-label={t('top')}
            className={`${FAB} border border-line bg-white text-xl font-bold text-green`}
          >
            <span aria-hidden="true">↑</span>
          </button>
        ) : null}
        {zaloUrl ? (
          <a
            href={zaloUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('zalo')}
            className={`${FAB} bg-[#0068ff] text-[11px] font-extrabold text-white`}
          >
            Zalo
          </a>
        ) : null}
        <button
          ref={opener}
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-expanded={open}
          aria-label={t('open')}
          className={`${FAB} bg-green text-2xl text-white hover:bg-green-deep`}
        >
          <span aria-hidden="true">{open ? '✕' : '💬'}</span>
        </button>
      </div>
    </div>
  );
}
