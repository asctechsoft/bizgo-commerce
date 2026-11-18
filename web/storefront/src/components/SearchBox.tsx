import { getTranslations } from 'next-intl/server';

/** Plain GET form: works without JavaScript and keeps the URL as the source of truth. */
export async function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  const t = await getTranslations('header');
  return (
    <form
      action="/danh-muc"
      method="get"
      role="search"
      className="flex h-11 min-w-0 flex-1 items-center overflow-hidden rounded-control border border-line bg-green-soft sm:max-w-[570px]"
    >
      <label htmlFor="site-search" className="sr-only">
        {t('searchLabel')}
      </label>
      <input
        id="site-search"
        name="search"
        type="search"
        defaultValue={defaultValue}
        maxLength={100}
        placeholder={t('searchPlaceholder')}
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-[14px] text-ink outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        className="h-full min-w-tap bg-green px-3 text-[13px] font-semibold text-white hover:bg-green-deep sm:px-5"
      >
        <span aria-hidden="true" className="sm:hidden">
          ⌕
        </span>
        <span className="sr-only sm:not-sr-only">{t('searchButton')}</span>
      </button>
    </form>
  );
}
