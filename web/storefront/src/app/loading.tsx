import { Skeleton } from '@bizgo/ui-web';

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="pt-6">
      <Skeleton className="h-8 w-48" />
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}
