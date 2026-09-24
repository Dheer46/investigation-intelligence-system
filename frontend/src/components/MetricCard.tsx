export default function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: 'high' | 'medium' | 'low';
}) {
  const accentClass =
    accent === 'high' ? 'text-alert-high' : accent === 'medium' ? 'text-alert-medium' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 px-5 py-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}
