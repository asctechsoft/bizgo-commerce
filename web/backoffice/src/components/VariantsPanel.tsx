'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminVariant, GateItem } from '@bizgo/contracts';
import { Badge, Button, Field, SelectInput, TextInput } from '@bizgo/ui-web';
import { ActionError } from './ActionError';
import { useBackoffice } from './AuthGate';

const STORAGE = ['DRY', 'AMBIENT', 'CHILLED', 'FROZEN', 'FRAGILE'] as const;

function intOrUndef(v: FormDataEntryValue | null): number | undefined {
  const s = String(v ?? '').trim();
  return s === '' ? undefined : Number(s);
}

function VariantRow({ v, reload }: { v: AdminVariant; reload: () => void }) {
  const t = useTranslations('variants');
  const { api } = useBackoffice();
  const [gate, setGate] = useState<{ ready: boolean; items: GateItem[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState<(() => Promise<void>) | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (fn: () => Promise<unknown>, after?: () => void) => {
    const attempt = async () => {
      setBusy(true);
      setError(null);
      setOk(false);
      try {
        await fn();
        setOk(true);
        after?.();
      } catch (e) {
        setError(e);
      } finally {
        setBusy(false);
      }
    };
    setRetry(() => attempt);
    await attempt();
  }, []);

  async function checkGate() {
    await run(async () => setGate(await api.admin.variants.readiness(v.id)));
  }

  function money(field: 'price' | 'cost') {
    return (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const raw = String(new FormData(form).get(field) ?? '').trim();
      if (!/^\d+$/.test(raw)) {
        setError(new Error('invalid'));
        return;
      }
      const n = Number(raw);
      void run(
        () =>
          field === 'price'
            ? api.admin.variants.setPrice({ variantId: v.id, unitPriceVnd: n })
            : api.admin.variants.setCost({ variantId: v.id, costVnd: n }),
        () => {
          form.reset();
          setGate(null);
        },
      );
    };
  }

  return (
    <li className="rounded-card border border-line bg-white p-4 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-[14px]">{v.sku}</strong>
        <span>{v.packLabel}</span>
        <Badge tone={v.status === 'ACTIVE' ? 'green' : 'neutral'}>{v.status}</Badge>
        {v.isTest ? <Badge tone="orange">{t('test')}</Badge> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void checkGate()} disabled={busy}>
          {t('readiness')}
        </Button>
        {gate?.ready && v.status !== 'ACTIVE' ? (
          <Button
            loading={busy}
            onClick={() =>
              void run(
                () => api.admin.variants.publish(v.id),
                () => reload(),
              )
            }
          >
            {t('publish')}
          </Button>
        ) : null}
      </div>
      {gate ? (
        <div className="mt-3" aria-live="polite">
          <p className={`m-0 font-bold ${gate.ready ? 'text-green' : 'text-danger'}`}>
            {gate.ready ? t('ready') : t('notReady')}
          </p>
          <ul className="m-0 mt-1 list-none p-0">
            {gate.items.map((i) => (
              <li key={i.item}>
                <span aria-hidden="true">{i.ok ? '✅' : '❌'}</span> {i.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(['price', 'cost'] as const).map((f) => (
          <form key={f} onSubmit={money(f)} noValidate>
            <Field id={`${f}-${v.id}`} label={t(f === 'price' ? 'price' : 'cost')}>
              {(a) => <TextInput {...a} name={f} inputMode="numeric" maxLength={15} />}
            </Field>
            <Button type="submit" variant="ghost" disabled={busy}>
              {t(f === 'price' ? 'setPrice' : 'setCost')}
            </Button>
          </form>
        ))}
      </div>
      {error ? (
        <ActionError error={error} {...(retry ? { onRetry: () => void retry() } : {})} />
      ) : null}
      {ok ? (
        <p role="status" className="mb-0 mt-2 font-semibold text-green">
          {t('saved')}
        </p>
      ) : null}
    </li>
  );
}

export function VariantsPanel({ productId }: { productId: string }) {
  const t = useTranslations('variants');
  const { api } = useBackoffice();
  const [items, setItems] = useState<AdminVariant[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);

  const load = useCallback(() => {
    api.admin.variants
      .list(productId)
      .then((r) => {
        setItems(r);
        setError(null);
      })
      .catch(setError);
  }, [api, productId]);
  useEffect(load, [load]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const storage = String(f.get('storageClass') ?? '');
    setBusy(true);
    setCreateError(null);
    try {
      const netWeightG = intOrUndef(f.get('netWeightG'));
      const manufacturer = String(f.get('manufacturer') ?? '').trim();
      const responsibleEntity = String(f.get('responsibleEntity') ?? '').trim();
      await api.admin.variants.create({
        productId,
        sku: String(f.get('sku') ?? '').trim(),
        packLabel: String(f.get('packLabel') ?? '').trim(),
        sellableUnit: String(f.get('sellableUnit') ?? '').trim(),
        ...(netWeightG !== undefined ? { netWeightG } : {}),
        ...(storage ? { storageClass: storage as (typeof STORAGE)[number] } : {}),
        ...(manufacturer ? { manufacturer } : {}),
        ...(responsibleEntity ? { responsibleEntity } : {}),
      });
      setOpen(false);
      load();
    } catch (e2) {
      setCreateError(e2);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="var-h" className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="var-h" className="m-0 text-[15px] font-bold">
          {t('title')}
        </h2>
        <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
          {t('add')}
        </Button>
      </div>
      {open ? (
        <form
          onSubmit={create}
          noValidate
          className="mt-3 rounded-card border border-line bg-white p-4"
        >
          {createError ? <ActionError error={createError} /> : null}
          <Field id="v-sku" label={t('sku')}>
            {(a) => <TextInput {...a} name="sku" maxLength={64} required />}
          </Field>
          <Field id="v-pack" label={t('packLabel')}>
            {(a) => <TextInput {...a} name="packLabel" maxLength={120} required />}
          </Field>
          <Field id="v-unit" label={t('sellableUnit')}>
            {(a) => <TextInput {...a} name="sellableUnit" maxLength={40} required />}
          </Field>
          <Field id="v-w" label={t('netWeightG')}>
            {(a) => <TextInput {...a} name="netWeightG" inputMode="numeric" />}
          </Field>
          <Field id="v-st" label={t('storageClass')}>
            {(a) => (
              <SelectInput {...a} name="storageClass" defaultValue="">
                <option value="">{t('none')}</option>
                {STORAGE.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field id="v-m" label={t('manufacturer')}>
            {(a) => <TextInput {...a} name="manufacturer" maxLength={200} />}
          </Field>
          <Field id="v-r" label={t('responsibleEntity')}>
            {(a) => <TextInput {...a} name="responsibleEntity" maxLength={200} />}
          </Field>
          <Button type="submit" loading={busy}>
            {t('save')}
          </Button>
        </form>
      ) : null}
      <div className="mt-3" aria-live="polite">
        {error ? (
          <ActionError error={error} onRetry={load} />
        ) : items && items.length === 0 ? (
          <p className="text-[13px] text-muted">{t('empty')}</p>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0">
            {(items ?? []).map((v) => (
              <VariantRow key={v.id} v={v} reload={load} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
