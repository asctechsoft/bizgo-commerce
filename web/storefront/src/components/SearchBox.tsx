import { getTranslations } from 'next-intl/server';

/** Plain GET form: works without JavaScript and keeps the URL as the source of truth. */
export async function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  const t = await getTranslations('header');
  return (
    <form
      action="/danh-muc"
      method="get"
      role="search"
      className="flex h-[38px] min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-[12px] border border-[#e4ebe4] bg-[#f6f8f5] pl-2 sm:h-[45px] sm:max-w-[570px] sm:pl-[15px]"
    >
      <span aria-hidden="true" className="hidden text-muted sm:inline">
        ⌕
      </span>
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
        className="h-full min-w-[70px] flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        className="h-full min-w-tap self-stretch bg-green px-3 text-[13px] font-semibold text-white hover:bg-green-deep sm:px-[22px]"
      >
        <span aria-hidden="true" className="sm:hidden">
          ⌕
        </span>
        <span className="sr-only sm:not-sr-only">{t('searchButton')}</span>
      </button>
    </form>
  );
}
