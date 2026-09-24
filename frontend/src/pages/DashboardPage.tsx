import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import MetricCard from '../components/MetricCard';
import { canAct, useAuthStore } from '../store/auth';
import type { DashboardMetrics } from '../types';

export default function DashboardPage() {
  const role = useAuthStore((s) => s.user?.role);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    api.get('/dashboard/metrics').then((res) => setMetrics(res.data));
  }, []);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="font-serif text-2xl text-slate-100 mb-1">Overview</h1>
          <p className="text-sm text-slate-500">Everything happening across your cases, at a glance.</p>
        </div>
        {canAct(role) && (
          <Link
            to="/cases"
            className="shrink-0 rounded-lg bg-trust-600 text-white text-sm font-medium px-4 py-2.5 hover:bg-trust-700"
          >
            Start a new case
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Open cases" value={metrics?.totalCases ?? '—'} />
        <MetricCard label="People & things found" value={metrics?.entitiesExtracted ?? '—'} />
        <MetricCard label="Connections found" value={metrics?.relationshipsFound ?? '—'} />
        <MetricCard
          label="Matches to confirm"
          value={metrics?.pendingReviewCandidates ?? '—'}
          accent={metrics && metrics.pendingReviewCandidates > 0 ? 'medium' : undefined}
        />
        <MetricCard
          label="Findings to review"
          value={metrics?.pendingHypotheses ?? '—'}
          accent={metrics && metrics.pendingHypotheses > 0 ? 'medium' : undefined}
        />
        <MetricCard label="Possible hidden links" value={metrics?.potentialHiddenLinks ?? '—'} />
        <MetricCard label="Groups found" value={metrics?.communitiesDetected ?? '—'} />
        <MetricCard
          label="Urgent alerts"
          value={metrics?.highPriorityAlerts ?? '—'}
          accent={metrics && metrics.highPriorityAlerts > 0 ? 'high' : undefined}
        />
      </div>
    </div>
  );
}
