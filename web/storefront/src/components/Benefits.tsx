import { getTranslations } from 'next-intl/server';

export async function Benefits() {
  const t = await getTranslations();
  const items = t.raw('benefits') as unknown as { icon: string; title: string; text: string }[];
  return (
    <ul className="m-0 mb-8 mt-6 grid list-none grid-cols-1 gap-3 p-0 min-[460px]:grid-cols-2 md:grid-cols-4">
      {items.map((b) => (
        <li
          key={b.title}
          className="flex items-center gap-3 rounded-[15px] border border-line bg-white p-3 sm:p-4"
        >
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-mint text-xl"
          >
            {b.icon}
          </span>
          <div>
            <strong className="text-[13px]">{b.title}</strong>
            <small className="mt-0.5 block text-xs leading-snug text-muted">{b.text}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}
