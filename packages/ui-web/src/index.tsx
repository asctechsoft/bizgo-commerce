import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'orange';

const BUTTON_BASE =
  'inline-flex min-h-tap items-center justify-center gap-2 rounded-control border px-4 py-2 text-[13px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60';
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-green bg-green text-white hover:bg-green-deep',
  secondary: 'border-green bg-white text-green hover:bg-green-mint',
  ghost: 'border-green-mint bg-green-mint text-green hover:bg-[#d9efe0]',
  orange: 'border-orange-deep bg-orange-deep text-white hover:bg-[#a84609]',
};

export function Button({
  variant = 'primary',
  className,
  loading,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], className)}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: (aria: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy })}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const INPUT =
  'min-h-tap w-full rounded-control border border-line bg-white px-3 py-2 text-[14px] text-ink placeholder:text-muted aria-[invalid=true]:border-danger';

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(INPUT, className)} />;
}

export function SelectInput({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cx(INPUT, className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx('animate-pulse rounded-control bg-green-soft', className)}
    />
  );
}

const LOADER_SIZE = {
  sm: 'h-16 w-16',
  md: 'h-24 w-24',
  lg: 'h-32 w-32',
} as const;

/**
 * Branded loading indicator: the BizGo box icon zooms in from small to full size while a ring
 * orbits around it. `inline` sits in the flow, `section` fills a content block, `page` centres in
 * the main area (route `loading.tsx`), `overlay` covers the viewport (blocking actions).
 * Motion respects prefers-reduced-motion (tokens.css). Pass `src` of the icon served by the app.
 */
export function Loader({
  variant = 'section',
  size,
  label = 'Đang tải…',
  showLabel = true,
  src = '/load/img_load.png',
  className,
}: {
  variant?: 'inline' | 'section' | 'page' | 'overlay';
  size?: keyof typeof LOADER_SIZE;
  label?: string;
  showLabel?: boolean;
  src?: string;
  className?: string;
}) {
  const dim = LOADER_SIZE[size ?? (variant === 'inline' ? 'sm' : variant === 'page' ? 'lg' : 'md')];
  const spinner = (
    <>
      <div className={cx('relative', dim)} aria-hidden="true">
        {/* track + orbiting arc with an orange head */}
        <span className="absolute inset-0 rounded-full border-[3px] border-green-mint" />
        <span className="absolute inset-0 animate-bg-orbit rounded-full border-[3px] border-transparent border-t-green">
          <span className="absolute -top-[6px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-orange shadow-[0_0_8px_#f67829]" />
        </span>
        {/* icon: pop-in once, then gentle breathing */}
        <span className="absolute inset-[14%] block animate-bg-pop">
          <span className="block h-full w-full animate-bg-breathe">
            {/* plain <img>: shared package has no next/image dependency */}
            <img
              src={src}
              alt=""
              width={256}
              height={256}
              decoding="async"
              className="h-full w-full object-contain drop-shadow-[0_6px_10px_#184b2c26]"
            />
          </span>
        </span>
      </div>
      {showLabel ? (
        <p className="m-0 text-[13px] font-semibold text-muted">{label}</p>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </>
  );
  const base = 'flex flex-col items-center justify-center gap-3';
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cx(
        base,
        variant === 'section' && 'w-full py-12',
        variant === 'page' && 'min-h-[60vh] w-full py-16',
        variant === 'overlay' && 'fixed inset-0 z-[100] bg-white/80 backdrop-blur-[2px]',
        className,
      )}
    >
      {spinner}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = '🌿',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div
      role="status"
      className="rounded-card border border-dashed border-line bg-green-soft px-6 py-12 text-center"
    >
      <div aria-hidden="true" className="mb-3 text-4xl">
        {icon}
      </div>
      <h2 className="m-0 text-lg font-bold text-ink">{title}</h2>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-[13px] text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  requestId,
  action,
}: {
  title: string;
  description?: string;
  requestId?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-card border border-[#f0c9c5] bg-[#fdf2f1] px-6 py-10 text-center"
    >
      <h2 className="m-0 text-lg font-bold text-danger">{title}</h2>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-[13px] text-ink">{description}</p>
      ) : null}
      {requestId ? <p className="mt-2 text-[11px] text-muted">Mã tham chiếu: {requestId}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'green' | 'orange' | 'danger';
  children: ReactNode;
}) {
  const tones = {
    neutral: 'bg-green-soft text-muted',
    green: 'bg-green-mint text-green',
    orange: 'bg-[#fff1e6] text-orange-deep',
    danger: 'bg-[#fdecea] text-danger',
  };
  return (
    <span className={cx('inline-block rounded-md px-2 py-1 text-[11px] font-bold', tones[tone])}>
      {children}
    </span>
  );
}

/** Visible only to assistive tech. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
