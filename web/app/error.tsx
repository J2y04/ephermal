'use client';

// No <html>/<body> here, unlike global-error.tsx — a route-segment error.tsx
// renders inside the root layout's own <html>/<body>, which already exist.
// Adding a second pair here would nest <html> inside <html>, invalid HTML
// that App Router only expects from global-error.tsx (which replaces the
// whole root layout on a catastrophic failure, not just a page-level one).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#08080c] px-6 text-[#eef0f7]">
      <div className="max-w-md rounded-[28px] border border-white/10 bg-[#0f0f13] p-8 shadow-2xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">Ephermal</div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm leading-6 text-white/65">
          Reload the page, or try again in a moment.
        </p>
        <pre className="mt-4 overflow-auto rounded-2xl bg-white/5 px-4 py-3 text-xs text-white/45">{error.message}</pre>
        <button
          onClick={reset}
          className="mt-5 rounded-xl bg-[#06d6c7] px-4 py-2 text-sm font-semibold text-[#08080c] transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
