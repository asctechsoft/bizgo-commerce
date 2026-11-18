import { getRequestConfig } from 'next-intl/server';

/** Admin and Factory portals are Vietnamese-only today; structure allows more locales later. */
export default getRequestConfig(async () => {
  const locale = 'vi';
  return {
    locale,
    timeZone: 'Asia/Ho_Chi_Minh',
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
