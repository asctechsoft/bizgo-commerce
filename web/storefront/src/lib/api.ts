import { createApiClient } from '@bizgo/contracts';

/** Server-side API client (Server Components). No demo fallback: failures surface as error states. */
export function serverApi() {
  return createApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:4000',
    next: { revalidate: 30 },
  });
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&')}=([^;]*)`),
  );
  return m ? decodeURIComponent(m[1] as string) : null;
}

/** Browser API client: cookie sessions + double-submit CSRF header (ADR-0002). */
export function browserApi() {
  return createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000',
    credentials: 'include',
    cache: 'no-store',
    getCsrfToken: () => readCookie('bg_csrf'),
  });
}
