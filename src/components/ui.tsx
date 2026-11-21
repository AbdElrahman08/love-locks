import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({ variant = 'primary', className = '', children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'quiet' | 'danger' }) {
  const v = {
    primary: 'bg-gradient-to-b from-brass-300 to-brass-500 text-night-950 shadow-glow hover:from-brass-300 hover:to-brass-400',
    ghost: 'border border-brass-400/40 text-brass-300 hover:bg-brass-400/10',
    quiet: 'text-ivory/70 hover:text-ivory hover:bg-white/5',
    danger: 'border border-rose-500/50 text-rose-300 hover:bg-rose-500/10',
  }[variant];
  return (
    <button {...rest} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass-300 ${v} ${className}`}>
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-white/10 bg-night-900/70 p-5 backdrop-blur-md ${className}`}>{children}</div>;
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-ivory/60">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-ivory/50">{hint}</span>}
      {error && <span className="block text-xs text-rose-300" role="alert">{error}</span>}
    </label>
  );
}

export const inputCls = 'w-full rounded-2xl border border-white/10 bg-night-950/70 px-4 py-3 text-ivory placeholder:text-ivory/30 focus:border-brass-400 focus:outline-none';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-8 text-ivory/60" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brass-400 border-t-transparent" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="text-center">
      <p className="text-ivory/80">{message}</p>
      {onRetry && <Button variant="ghost" className="mt-4" onClick={onRetry}>Try again</Button>}
    </Card>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="text-center">
      <p className="font-display text-2xl text-brass-300">{title}</p>
      <p className="mt-2 text-sm text-ivory/60">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`min-h-9 shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition ${active ? 'border-brass-400 bg-brass-400/15 text-brass-300' : 'border-white/10 text-ivory/70 hover:border-white/30'}`}>
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-4xl font-semibold text-ivory">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ivory/60">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
