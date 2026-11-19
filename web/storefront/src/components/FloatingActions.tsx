import { getTranslations } from 'next-intl/server';
import { serverApi } from '@/lib/api';
import { FloatingActionsClient } from './FloatingActionsClient';

/**
 * Corner buttons: scroll-to-top, Zalo (only when the owner configured a Zalo link) and the quick-help chat.
 * The chat is NOT an AI assistant: it answers from the published FAQ and forwards questions to staff.
 */
export async function FloatingActions() {
  const t = await getTranslations();
  let zalo: string | null = null;
  try {
    zalo = (await serverApi().content.siteInfo()).contact.social.zalo;
  } catch {
    // Site info is optional here: never break every page because of a corner widget.
  }
  const faq = [
    ...(t.raw('wholesale.faq') as { q: string; a: string }[]),
    ...(t.raw('contact.faq') as { q: string; a: string }[]),
  ];
  return <FloatingActionsClient zaloUrl={zalo} faq={faq} />;
}
