import { confidenceBand } from '../utils/readable';

export default function ConfidenceBadge({ score }: { score: number }) {
  const { label, className } = confidenceBand(score);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
