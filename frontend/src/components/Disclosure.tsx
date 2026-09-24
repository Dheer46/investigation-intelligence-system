import { useState } from 'react';

export default function Disclosure({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-ink-800/50"
      >
        <div>
          <span className="text-sm font-medium text-slate-100">{title}</span>
          {subtitle && <span className="block text-xs text-slate-500 mt-0.5">{subtitle}</span>}
        </div>
        <span className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && <div className="px-5 pb-5 border-t border-ink-700 pt-4">{children}</div>}
    </div>
  );
}
