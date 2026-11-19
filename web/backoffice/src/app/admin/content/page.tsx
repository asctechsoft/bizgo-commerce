'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminArticle, ArticleCategory, ArticleStatus } from '@bizgo/contracts';
import { Badge, Button, EmptyState, Field, Loader, SelectInput, TextInput } from '@bizgo/ui-web';
import { ActionError } from '@/components/ActionError';
import { AdminShell } from '@/components/AdminShell';
import { AuthGate, useBackoffice } from '@/components/AuthGate';

const CATEGORIES: ArticleCategory[] = ['RECIPE', 'INGREDIENT', 'BUSINESS', 'STORAGE', 'WHOLESALE'];
const STATUSES: ArticleStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
/** Cover art that ships with the storefront (public/blog). Any https URL is also accepted. */
const COVER_PRESETS = [
  '/blog/post_thai_dessert.png',
  '/blog/post_layered_dessert.png',
  '/blog/post_jelly_cubes.png',
  '/blog/post_tremella_dessert.png',
  '/blog/post_tapioca_pearls.png',
  '/blog/post_mung_beans.png',
];
const TEXTAREA =
  'w-full rounded-control border border-line bg-white px-3 py-2 text-[14px] text-ink placeholder:text-muted aria-[invalid=true]:border-danger';

interface Draft {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  category: ArticleCategory;
  coverImage: string;
  featured: boolean;
}
const EMPTY: Draft = {
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  category: 'RECIPE',
  coverImage: '',
  featured: false,
};
const toDraft = (a: AdminArticle): Draft => ({
  title: a.title,
  slug: a.slug,
  excerpt: a.excerpt,
  body: a.body,
  category: a.category,
  coverImage: a.coverImage ?? '',
  featured: a.featured,
});

function Manager() {
  const t = useTranslations('content');
  const { api } = useBackoffice();
  const [filter, setFilter] = useState<ArticleStatus | ''>('');
  const [list, setList] = useState<AdminArticle[] | null>(null);
  const [selected, setSelected] = useState<AdminArticle | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.admin.articles.list({ ...(filter ? { status: filter } : {}), limit: 50 });
      setList(r.items);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [api, filter]);
  useEffect(() => {
    void load();
  }, [load]);

  function open(a: AdminArticle | 'new') {
    setSelected(a);
    setDraft(a === 'new' ? EMPTY : toDraft(a));
    setSaved(false);
    setError(null);
  }
  const isNew = selected === 'new';
  const current = selected && selected !== 'new' ? selected : null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function run(action: () => Promise<AdminArticle>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const a = await action();
      setSelected(a);
      setDraft(toDraft(a));
      setSaved(true);
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const payload = {
      title: draft.title.trim(),
      excerpt: draft.excerpt.trim(),
      body: draft.body.trim(),
      category: draft.category,
      coverImage: draft.coverImage.trim() || null,
      featured: draft.featured,
    };
    if (isNew) {
      void run(() =>
        api.admin.articles.create({
          ...payload,
          ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
        }),
      );
    } else if (current) {
      void run(() =>
        api.admin.articles.update(current.id, {
          ...payload,
          ...(current.status !== 'PUBLISHED' && draft.slug.trim() && draft.slug !== current.slug
            ? { slug: draft.slug.trim() }
            : {}),
        }),
      );
    }
  }

  const tone = (s: ArticleStatus) =>
    s === 'PUBLISHED' ? 'green' : s === 'DRAFT' ? 'orange' : 'neutral';

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-2xl font-extrabold">{t('title')}</h1>
        <Button onClick={() => open('new')}>{t('new')}</Button>
      </div>
      <p className="mb-0 mt-1 text-[13px] text-muted">{t('hint')}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('status')}>
        {(['', ...STATUSES] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
            className={`min-h-[40px] rounded-full border px-4 text-[12px] font-semibold ${filter === s ? 'border-green bg-green text-white' : 'border-line bg-white'}`}
          >
            {s ? t(`statuses.${s}`) : t('all')}
          </button>
        ))}
      </div>

      {error && !selected ? <ActionError error={error} onRetry={() => void load()} /> : null}
      {!list && !error ? <Loader variant="section" /> : null}

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          {list && list.length === 0 ? <EmptyState title={t('empty')} /> : null}
          <ul className="m-0 grid list-none gap-2 p-0">
            {list?.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => open(a)}
                  aria-current={current?.id === a.id}
                  className={`w-full rounded-card border p-3 text-left text-[13px] ${current?.id === a.id ? 'border-green bg-green-mint' : 'border-line bg-white hover:bg-green-soft'}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <b className="truncate">{a.title}</b>
                    <Badge tone={tone(a.status)}>{t(`statuses.${a.status}`)}</Badge>
                  </span>
                  <span className="block text-[11px] text-muted">
                    {t(`categories.${a.category}`)}
                    {a.featured ? ` · ★ ${t('featured')}` : ''} ·{' '}
                    {new Date(a.updatedAt).toLocaleString('vi-VN')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {selected ? (
          <form
            onSubmit={save}
            noValidate
            className="rounded-card border border-line bg-white p-4"
            aria-label={isNew ? t('new') : (current?.title ?? '')}
          >
            {error ? (
              <div className="mb-3">
                <ActionError error={error} />
              </div>
            ) : null}
            {saved ? (
              <p role="status" className="mb-3 mt-0 text-[13px] font-semibold text-green">
                ✓ {t('saved')}
              </p>
            ) : null}
            <Field id="a-title" label={t('fTitle')}>
              {(a) => (
                <TextInput
                  {...a}
                  value={draft.title}
                  maxLength={160}
                  onChange={(e) => set('title', e.target.value)}
                />
              )}
            </Field>
            <Field
              id="a-slug"
              label={t('fSlug')}
              hint={current?.status === 'PUBLISHED' ? t('slugLocked') : t('slugHint')}
            >
              {(a) => (
                <TextInput
                  {...a}
                  value={draft.slug}
                  maxLength={120}
                  disabled={current?.status === 'PUBLISHED'}
                  onChange={(e) => set('slug', e.target.value)}
                />
              )}
            </Field>
            <Field id="a-cat" label={t('fCategory')}>
              {(a) => (
                <SelectInput
                  {...a}
                  value={draft.category}
                  onChange={(e) => set('category', e.target.value as ArticleCategory)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`categories.${c}`)}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
            <Field id="a-excerpt" label={t('fExcerpt')}>
              {(a) => (
                <textarea
                  {...a}
                  rows={2}
                  maxLength={300}
                  value={draft.excerpt}
                  onChange={(e) => set('excerpt', e.target.value)}
                  className={TEXTAREA}
                />
              )}
            </Field>
            <Field id="a-cover" label={t('fCover')} hint={t('coverHint')}>
              {(a) => (
                <>
                  <TextInput
                    {...a}
                    list="cover-presets"
                    value={draft.coverImage}
                    maxLength={300}
                    onChange={(e) => set('coverImage', e.target.value)}
                  />
                  <datalist id="cover-presets">
                    {COVER_PRESETS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field id="a-body" label={t('fBody')} hint={t('bodyHint')}>
              {(a) => (
                <textarea
                  {...a}
                  rows={14}
                  maxLength={20000}
                  value={draft.body}
                  onChange={(e) => set('body', e.target.value)}
                  className={`${TEXTAREA} font-mono text-[13px]`}
                />
              )}
            </Field>
            <label className="mb-4 flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={draft.featured}
                onChange={(e) => set('featured', e.target.checked)}
              />
              {t('fFeatured')}
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy}>
                {t('save')}
              </Button>
              {current && current.status !== 'PUBLISHED' ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void run(() => api.admin.articles.publish(current.id))}
                >
                  {t('publish')}
                </Button>
              ) : null}
              {current && current.status === 'PUBLISHED' ? (
                <Button
                  variant="orange"
                  disabled={busy}
                  onClick={() => void run(() => api.admin.articles.archive(current.id))}
                >
                  {t('archive')}
                </Button>
              ) : null}
            </div>
          </form>
        ) : (
          <EmptyState title={t('pick')} icon="📝" />
        )}
      </div>
    </AdminShell>
  );
}

export default function ContentPage() {
  return (
    <AuthGate realm="ADMIN">
      <Manager />
    </AuthGate>
  );
}
