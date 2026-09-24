import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import RevealOnScroll from '../components/RevealOnScroll';
import { SOURCE_TYPE_LABEL } from '../utils/readable';
import type { Case, ReconstructionBeat } from '../types';

function formatDateLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function Tag({ children, kind }: { children: string; kind: 'person' | 'place' | 'org' }) {
  const styles: Record<'person' | 'place' | 'org', string> = {
    person: 'border-trust-600/30 bg-trust-600/10 text-trust-400',
    place: 'border-ink-700 bg-ink-800 text-slate-400',
    org: 'border-alert-medium/30 bg-alert-medium/10 text-alert-medium',
  };
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs ${styles[kind]}`}>{children}</span>;
}

function BeatCard({ beat }: { beat: ReconstructionBeat }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-5">
      <p className="text-[15px] leading-relaxed text-slate-200">{beat.text}</p>
      {(beat.people.length > 0 || beat.locations.length > 0 || beat.organizations.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {beat.people.map((p) => (
            <Tag key={`p-${p}`} kind="person">
              {p}
            </Tag>
          ))}
          {beat.locations.map((l) => (
            <Tag key={`l-${l}`} kind="place">
              {l}
            </Tag>
          ))}
          {beat.organizations.map((o) => (
            <Tag key={`o-${o}`} kind="org">
              {o}
            </Tag>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-600">
        {SOURCE_TYPE_LABEL[beat.sourceType] ?? 'Document'} · {beat.documentName}
      </p>
    </div>
  );
}

export default function ReconstructionPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [beats, setBeats] = useState<ReconstructionBeat[] | null>(null);

  useEffect(() => {
    if (!caseId) return;
    api.get(`/cases/${caseId}`).then((res) => setCaseData(res.data));
    api.get(`/cases/${caseId}/reconstruction`).then((res) => setBeats(res.data.beats));
  }, [caseId]);

  if (beats === null) {
    return <div className="p-8 text-sm text-slate-500">Putting the story together…</div>;
  }

  const dated = beats.filter((b) => b.date !== null);
  const undated = beats.filter((b) => b.date === null);

  // Group consecutive dated beats under one date heading instead of
  // repeating the same date on every card.
  const groups: { date: string; beats: ReconstructionBeat[] }[] = [];
  for (const beat of dated) {
    const last = groups[groups.length - 1];
    if (last && last.date === beat.date) last.beats.push(beat);
    else groups.push({ date: beat.date as string, beats: [beat] });
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <Link to={`/cases/${caseId}`} className="text-xs text-slate-500 hover:text-slate-300">
        ← Back to case
      </Link>

      <h1 className="font-serif text-2xl text-slate-100 mt-3">How it unfolded</h1>
      <p className="text-sm text-slate-500 mt-1 mb-2">{caseData?.title}</p>
      <p className="text-sm text-slate-500 max-w-xl">
        A reconstruction of events, put together from the reports and records uploaded to this case, in the order
        they happened.
      </p>

      {beats.length === 0 && (
        <p className="mt-10 text-sm text-slate-500">
          Not enough narrative detail yet — upload reports like FIRs or intelligence reports and analyze the case
          again to build this timeline.
        </p>
      )}

      {groups.length > 0 && (
        <div className="mt-10 border-l border-ink-700 pl-6 space-y-10">
          {groups.map((group, groupIndex) => (
            <div key={group.date} className="relative">
              <div className="absolute -left-[31px] top-1 h-3 w-3 rounded-full bg-trust-500 ring-4 ring-ink-950" />
              <RevealOnScroll delayMs={Math.min(groupIndex, 4) * 80}>
                <h2 className="font-serif text-lg text-trust-400 mb-3">{formatDateLabel(group.date)}</h2>
                <div className="space-y-3">
                  {group.beats.map((beat) => (
                    <BeatCard key={beat.id} beat={beat} />
                  ))}
                </div>
              </RevealOnScroll>
            </div>
          ))}
        </div>
      )}

      {undated.length > 0 && (
        <div className="mt-12">
          <RevealOnScroll>
            <h2 className="text-sm font-medium text-slate-400 mb-3">Other details from the case files</h2>
            <p className="text-xs text-slate-600 mb-3">These are relevant, but no clear date was found for them.</p>
            <div className="space-y-3">
              {undated.map((beat) => (
                <BeatCard key={beat.id} beat={beat} />
              ))}
            </div>
          </RevealOnScroll>
        </div>
      )}

      {beats.length > 0 && (
        <p className="mt-12 text-xs text-slate-600 border-t border-ink-700 pt-4">
          Built automatically from the documents uploaded to this case. Treat it as a starting point for the
          investigation, not a verified account — always confirm against the original documents.
        </p>
      )}
    </div>
  );
}
