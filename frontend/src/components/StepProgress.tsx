interface Step {
  label: string;
}

export default function StepProgress({ steps, currentIndex }: { steps: Step[]; currentIndex: number }) {
  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step.label} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  done
                    ? 'bg-trust-600 text-white'
                    : active
                      ? 'bg-trust-600/20 text-trust-400 border-2 border-trust-600 animate-pulse'
                      : 'bg-ink-800 text-slate-600 border border-ink-700'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={`text-sm ${active ? 'text-slate-100 font-medium' : done ? 'text-slate-400' : 'text-slate-600'}`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && <span className="w-6 h-px bg-ink-700 mx-1" aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}
