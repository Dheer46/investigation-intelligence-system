// Converts the raw scores the pipeline produces (confidence 0-1, PageRank,
// betweenness) into plain-language bands. An investigator should never have
// to interpret a decimal to know whether something is worth their attention.

export type Band = 'high' | 'medium' | 'low';

export interface BandInfo {
  band: Band;
  label: string;
  className: string;
}

// Mirrors the thresholds the resolution/analytics pipeline already uses
// (0.85 auto-merge, 0.55 review floor) so the label an investigator sees
// matches the confidence tier the system actually acted on.
export function confidenceBand(score: number): BandInfo {
  if (score >= 0.8) {
    return { band: 'high', label: 'Strong lead', className: 'bg-trust-600/15 text-trust-400 border-trust-600/30' };
  }
  if (score >= 0.55) {
    return { band: 'medium', label: 'Worth checking', className: 'bg-alert-medium/15 text-alert-medium border-alert-medium/30' };
  }
  return { band: 'low', label: 'Uncertain', className: 'bg-ink-700 text-slate-400 border-ink-700' };
}

// PageRank scores are unbounded floating point with no intuitive scale -
// bucket by relative rank within the case instead of an absolute cutoff.
export function centralityLabel(rank: number, totalPeople: number): string {
  if (totalPeople <= 1) return 'Only person mentioned';
  if (rank === 0) return 'Central figure';
  if (rank <= 2) return 'Closely connected';
  return 'Mentioned';
}

// "38fe4bb1-1785-..." means nothing to an investigator - prefer the human
// label (case number, document name, person name) everywhere in the UI.
export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function roleLabel(role: string | undefined): string {
  if (!role) return '';
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  FIR: 'Police report',
  INTELLIGENCE_REPORT: 'Intelligence report',
  CDR: 'Call records',
  FINANCIAL_TRANSACTION: 'Financial records',
  OSINT: 'Open-source intel',
  OTHER: 'Document',
};

// Provenance anchors like "page:3", "row:5", "sheet:Q1|row:12" are exactly
// the kind of engineering telemetry an investigator shouldn't have to parse -
// translate the common shapes into a plain phrase.
export function humanizeLocationRef(ref: string | null): string {
  if (!ref) return 'Found in this file';
  if (ref === 'whole-document') return 'Found in this file';
  if (ref.startsWith('ocr:')) return 'Found in this image';
  if (ref.startsWith('page:')) return `Page ${ref.split(':')[1]}`;
  if (ref.startsWith('paragraph:')) return `Paragraph ${ref.split(':')[1]}`;
  if (ref.startsWith('row:')) return `Row ${ref.split(':')[1]}`;
  if (ref.startsWith('event:')) return `Record ${ref.split(':')[1]}`;
  if (ref.startsWith('json_item:')) return `Item ${Number(ref.split(':')[1]) + 1}`;
  if (ref.includes('|row:')) {
    const [sheet, row] = ref.split('|');
    return `Row ${row.split(':')[1]} (${sheet.split(':')[1]})`;
  }
  return 'Found in this file';
}
