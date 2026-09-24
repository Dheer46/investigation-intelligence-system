import { centralityLabel } from '../utils/readable';
import type { TopConnector } from '../types';

const TYPE_LABEL: Record<string, string> = {
  PERSON: 'Person',
  PHONE: 'Phone number',
  VEHICLE: 'Vehicle',
  LOCATION: 'Location',
  ORGANIZATION: 'Organization',
  BANK_ACCOUNT: 'Bank account',
};

export default function TopConnectorsList({ connectors }: { connectors: TopConnector[] }) {
  if (connectors.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Run "Analyze case" to see who the key people and connectors are.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {connectors.map((c, i) => (
        <li
          key={c.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-800/60 px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium text-slate-100">{c.name}</p>
            <p className="text-xs text-slate-500">{TYPE_LABEL[c.entityType] ?? c.entityType}</p>
          </div>
          <span className="shrink-0 text-xs text-trust-400">{centralityLabel(i, connectors.length)}</span>
        </li>
      ))}
    </ul>
  );
}
