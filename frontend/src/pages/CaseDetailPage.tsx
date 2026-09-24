import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { canAct, useAuthStore } from '../store/auth';
import GraphView from '../components/GraphView';
import EntityDetailPanel from '../components/EntityDetailPanel';
import HypothesisCard from '../components/HypothesisCard';
import TopConnectorsList from '../components/TopConnectorsList';
import StepProgress from '../components/StepProgress';
import Disclosure from '../components/Disclosure';
import DatasetDropzone from '../components/DatasetDropzone';
import type { Case, CaseDocument, GraphElements, Hypothesis, TopConnector } from '../types';

const ENTITY_TYPES = [
  { value: 'PERSON', label: 'People' },
  { value: 'PHONE', label: 'Phone numbers' },
  { value: 'VEHICLE', label: 'Vehicles' },
  { value: 'LOCATION', label: 'Locations' },
  { value: 'ORGANIZATION', label: 'Organizations' },
  { value: 'BANK_ACCOUNT', label: 'Bank accounts' },
];

const DOCUMENT_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  UPLOADED: { label: 'Waiting to process', className: 'text-slate-500' },
  QUEUED: { label: 'Waiting to process', className: 'text-slate-500' },
  PROCESSING: { label: 'Reading…', className: 'text-trust-400' },
  PROCESSED: { label: 'Ready', className: 'text-alert-low' },
  FAILED: { label: 'Could not read this file', className: 'text-alert-high' },
};

const ANALYZE_STEPS = [
  { label: 'Linking duplicate names and numbers' },
  { label: 'Mapping the connections' },
  { label: 'Looking for suspects and patterns' },
];

export default function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const role = useAuthStore((s) => s.user?.role);
  const allowActions = canAct(role);
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [graph, setGraph] = useState<GraphElements['elements'] | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ id: string; entityType: string; label: string } | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [topConnectors, setTopConnectors] = useState<TopConnector[]>([]);
  const [showAnalyticsOverlay, setShowAnalyticsOverlay] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState<number | null>(null);
  const [manualBusy, setManualBusy] = useState<string | null>(null);
  const [removingDocId, setRemovingDocId] = useState<string | null>(null);
  const [confirmingDocId, setConfirmingDocId] = useState<string | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function loadCase() {
    if (!caseId) return;
    api.get(`/cases/${caseId}`).then((res) => {
      setCaseData(res.data);
      setDocuments(res.data.documents);
    });
  }

  function loadGraph() {
    if (!caseId) return;
    api.get(`/cases/${caseId}/graph`).then((res) => setGraph(res.data.elements));
  }

  function loadHypotheses() {
    if (!caseId) return;
    api.get(`/cases/${caseId}/hypotheses`).then((res) => setHypotheses(res.data));
  }

  function loadTopConnectors() {
    if (!caseId) return;
    api.get(`/cases/${caseId}/top-connectors`).then((res) => setTopConnectors(res.data));
  }

  useEffect(() => {
    loadCase();
    loadGraph();
    loadHypotheses();
    loadTopConnectors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  // The single guided action: link duplicate records, rebuild the network,
  // then look for suspects/patterns - what used to be three separate manual
  // buttons (resolve / sync / analyze) that only an engineer would know to
  // click in the right order.
  async function handleAnalyze() {
    if (!caseId) return;
    setAnalyzeStep(0);
    try {
      await api.post(`/cases/${caseId}/resolve`);
      setAnalyzeStep(1);
      await api.post(`/cases/${caseId}/graph/sync`);
      loadGraph();
      setAnalyzeStep(2);
      await api.post(`/cases/${caseId}/analytics/run`);
      loadGraph();
      loadHypotheses();
      loadTopConnectors();
      setShowAnalyticsOverlay(true);
    } finally {
      setAnalyzeStep(null);
    }
  }

  async function handleManualSync() {
    if (!caseId) return;
    setManualBusy('sync');
    try {
      await api.post(`/cases/${caseId}/graph/sync`);
      loadGraph();
    } finally {
      setManualBusy(null);
    }
  }

  async function handleRemoveDocument(documentId: string) {
    if (!caseId) return;
    if (confirmingDocId !== documentId) {
      setConfirmingDocId(documentId);
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      // Auto-revert rather than relying on a hover/blur signal - the mouse
      // naturally drifts off the row right after the click that armed this,
      // so "leaves the row cancels it" was cancelling itself immediately.
      confirmTimeoutRef.current = setTimeout(() => setConfirmingDocId(null), 5000);
      return;
    }
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    setConfirmingDocId(null);
    setRemovingDocId(documentId);
    try {
      await api.delete(`/cases/${caseId}/documents/${documentId}`);
      loadCase();
    } finally {
      setRemovingDocId(null);
    }
  }

  async function handleHypothesisAction(id: string, action: 'ACCEPTED' | 'REJECTED' | 'ESCALATED', notes?: string) {
    await api.post(`/hypotheses/${id}/actions`, { action, notes });
    loadHypotheses();
  }

  function toggleType(type: string) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const dimmedIds = useMemo(() => {
    if (!graph) return null;
    const q = search.trim().toLowerCase();
    if (activeTypes.size === 0 && !q) return null;
    const dimmed = new Set<string>();
    for (const node of graph.nodes) {
      const typeMatches = activeTypes.size === 0 || activeTypes.has(node.data.entityType);
      const searchMatches = !q || node.data.label.toLowerCase().includes(q);
      if (!typeMatches || !searchMatches) {
        dimmed.add(node.data.id);
      }
    }
    return dimmed;
  }, [graph, activeTypes, search]);

  const pendingFindings = hypotheses.filter((h) => h.status === 'PENDING_REVIEW');
  const reviewedFindings = hypotheses.filter((h) => h.status !== 'PENDING_REVIEW');
  const hasResults = topConnectors.length > 0 || hypotheses.length > 0;
  const readyDocs = documents.filter((d) => d.status === 'PROCESSED').length;

  return (
    <div className="flex h-screen">
      <div className="flex-1 overflow-y-auto px-8 py-8 max-w-5xl mx-auto w-full">
        <h1 className="font-serif text-2xl text-slate-100">{caseData?.title}</h1>
        <p className="text-sm text-slate-500 mb-8">{caseData?.caseNumber}</p>

        {/* Step 1: bring in the files */}
        {allowActions && (
          <section className="mb-8">
            <h2 className="text-base font-medium text-slate-100 mb-1">1. Add case files</h2>
            <p className="text-sm text-slate-500 mb-4">
              Upload reports, call records, financial statements, or any other files for this case.
            </p>
            <div className="rounded-xl border border-ink-700 bg-ink-900 p-5">
              <DatasetDropzone caseId={caseId!} onUploaded={loadCase} />
            </div>
            <Link
              to={`/social-feed?caseId=${caseId}`}
              className="inline-block mt-2 text-xs text-trust-400 hover:text-trust-500"
            >
              Or simulate a social media post as evidence →
            </Link>
          </section>
        )}

        {documents.length > 0 && (
          <section className="mb-8">
            <div className="rounded-xl border border-ink-700 bg-ink-900 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-200">
                  Files in this case ({readyDocs} of {documents.length} ready)
                </h3>
              </div>
              <ul className="space-y-1.5 max-h-40 overflow-y-auto text-sm">
                {documents.map((d) => {
                  const status = DOCUMENT_STATUS_LABEL[d.status] ?? { label: d.status, className: 'text-slate-500' };
                  const isConfirming = confirmingDocId === d.id;
                  return (
                    <li key={d.id} className="flex items-center justify-between text-slate-300 gap-3">
                      <span className="truncate">{d.originalName}</span>
                      <span className="shrink-0 flex items-center gap-2">
                        <span className={`text-xs ${status.className}`}>{status.label}</span>
                        {allowActions && (
                          <button
                            onClick={() => handleRemoveDocument(d.id)}
                            disabled={removingDocId === d.id}
                            title={isConfirming ? 'Click again to permanently remove this file' : 'Remove this file from the case'}
                            className={`text-xs disabled:opacity-40 ${
                              isConfirming ? 'text-alert-high font-medium' : 'text-slate-600 hover:text-alert-high'
                            }`}
                          >
                            {removingDocId === d.id ? 'Removing…' : isConfirming ? 'Confirm?' : 'Remove'}
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {/* Step 2: one guided action */}
        {allowActions && documents.length > 0 && (
          <section className="mb-8">
            <h2 className="text-base font-medium text-slate-100 mb-1">2. Find the connections</h2>
            <p className="text-sm text-slate-500 mb-4">
              This links records that refer to the same person or number, builds the network, and looks for
              suspects and patterns worth a closer look.
            </p>
            {analyzeStep !== null ? (
              <div className="rounded-xl border border-trust-600/30 bg-trust-600/5 p-5">
                <StepProgress steps={ANALYZE_STEPS} currentIndex={analyzeStep} />
              </div>
            ) : (
              <button
                onClick={handleAnalyze}
                disabled={readyDocs === 0}
                className="rounded-lg bg-trust-600 text-white text-sm font-medium px-5 py-3 hover:bg-trust-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {hasResults ? 'Analyze again' : 'Analyze this case'}
              </button>
            )}
            {readyDocs === 0 && analyzeStep === null && (
              <p className="text-xs text-slate-600 mt-2">Waiting for at least one file to finish being read.</p>
            )}
          </section>
        )}

        {/* Step 3: results, in plain language */}
        {hasResults && (
          <section className="mb-8 space-y-8">
            <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-1">
              <h2 className="text-base font-medium text-slate-100">3. What we found</h2>
              <div className="flex items-center gap-4">
                <Link to={`/review-queue?caseId=${caseId}`} className="text-sm text-trust-400 hover:text-trust-500">
                  Possible matches for this case →
                </Link>
                <Link to={`/cases/${caseId}/reconstruction`} className="text-sm text-trust-400 hover:text-trust-500">
                  See how it unfolded →
                </Link>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">Key people and connectors</h3>
              <TopConnectorsList connectors={topConnectors} />
            </div>

            {pendingFindings.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-300 mb-3">Findings to review</h3>
                <div className="space-y-3">
                  {pendingFindings.map((h) => (
                    <HypothesisCard key={h.id} hypothesis={h} onAction={handleHypothesisAction} />
                  ))}
                </div>
              </div>
            )}

            {reviewedFindings.length > 0 && (
              <Disclosure title={`Reviewed findings (${reviewedFindings.length})`}>
                <div className="space-y-3">
                  {reviewedFindings.map((h) => (
                    <HypothesisCard key={h.id} hypothesis={h} onAction={handleHypothesisAction} />
                  ))}
                </div>
              </Disclosure>
            )}
          </section>
        )}

        {/* Advanced: the network graph and manual controls, for those who want them */}
        <Disclosure
          title="Explore the network"
          subtitle="See how everyone and everything connects, visually"
        >
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={showAnalyticsOverlay}
                onChange={(e) => setShowAnalyticsOverlay(e.target.checked)}
              />
              Highlight groups &amp; key people
            </label>
            <input
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ml-auto rounded-md bg-ink-800 border border-ink-700 px-3 py-1.5 text-xs text-slate-100 w-48"
            />
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {ENTITY_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => toggleType(t.value)}
                className={`rounded-full px-3 py-1 text-xs border ${
                  activeTypes.has(t.value)
                    ? 'border-trust-500 text-trust-400 bg-trust-600/10'
                    : 'border-ink-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-ink-700 bg-ink-900 h-[480px] flex overflow-hidden">
            <GraphView
              data={graph}
              onNodeSelect={(id, entityType, label) => setSelectedNode({ id, entityType, label })}
              dimmedIds={dimmedIds}
              showAnalytics={showAnalyticsOverlay}
            />
          </div>
          <p className="text-xs text-slate-600 mt-2">Click on anyone or anything in the network to see the evidence behind it.</p>

          {allowActions && (
            <div className="mt-4 pt-4 border-t border-ink-700">
              <button
                onClick={handleManualSync}
                disabled={manualBusy !== null}
                className="rounded-md border border-ink-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-ink-800 disabled:opacity-50"
              >
                {manualBusy === 'sync' ? 'Refreshing…' : 'Refresh network view'}
              </button>
              <p className="text-xs text-slate-600 mt-1.5">
                Use this if you've re-analyzed the case and the diagram above looks out of date.
              </p>
            </div>
          )}
        </Disclosure>
      </div>

      {selectedNode && (
        <EntityDetailPanel
          nodeId={selectedNode.id}
          entityType={selectedNode.entityType}
          label={selectedNode.label}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
