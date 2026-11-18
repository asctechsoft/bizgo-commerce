import { getRequestConfig } from 'next-intl/server';

/**
 * Localisation structure (ADR-0011): Vietnamese is the only locale today. Adding a language means
 * adding messages/<locale>.json and resolving the locale here — no component changes.
 */
export default getRequestConfig(async () => {
  const locale = 'vi';
  return {
    locale,
    timeZone: 'Asia/Ho_Chi_Minh',
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
