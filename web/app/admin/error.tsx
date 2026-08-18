'use client';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-eph-bg px-6 text-eph-text">
      <div className="max-w-md rounded-[28px] border border-eph-border bg-eph-surface p-8 shadow-2xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-eph-subtle">Admin overview</div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Something tripped up the page</h1>
        <p className="mt-3 text-sm leading-6 text-eph-muted">
          The admin overview hit an unexpected error. Try reloading the page.
        </p>
        <pre className="mt-4 overflow-auto rounded-2xl bg-eph-surface2 px-4 py-3 text-xs text-eph-subtle">{error.message}</pre>
        <button
          onClick={reset}
          className="mt-5 rounded-xl bg-eph-primary px-4 py-2 text-sm font-semibold text-eph-bg transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
