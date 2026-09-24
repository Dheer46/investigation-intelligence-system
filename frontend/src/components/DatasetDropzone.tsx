import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { api } from '../api/client';

const SOURCE_TYPES: { value: string; label: string }[] = [
  { value: 'FIR', label: 'Police reports / FIRs' },
  { value: 'INTELLIGENCE_REPORT', label: 'Intelligence reports' },
  { value: 'CDR', label: 'Call records (CDR)' },
  { value: 'FINANCIAL_TRANSACTION', label: 'Financial / bank records' },
  { value: 'OSINT', label: 'Open-source / social intel' },
  { value: 'OTHER', label: 'Other' },
];

type FileState = { file: File; status: 'pending' | 'uploading' | 'done' | 'error' };

export default function DatasetDropzone({
  caseId,
  onUploaded,
}: {
  caseId: string;
  onUploaded: () => void;
}) {
  const [sourceType, setSourceType] = useState('FIR');
  const [queue, setQueue] = useState<FileState[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setQueue((prev) => [...prev, ...Array.from(fileList).map((file) => ({ file, status: 'pending' as const }))]);
  }

  async function uploadAll() {
    setUploading(true);
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== 'pending') continue;
      setQueue((prev) => prev.map((q, idx) => (idx === i ? { ...q, status: 'uploading' } : q)));
      const form = new FormData();
      form.append('sourceType', sourceType);
      form.append('file', queue[i].file);
      try {
        await api.post(`/cases/${caseId}/documents`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setQueue((prev) => prev.map((q, idx) => (idx === i ? { ...q, status: 'done' } : q)));
      } catch {
        setQueue((prev) => prev.map((q, idx) => (idx === i ? { ...q, status: 'error' } : q)));
      }
    }
    setUploading(false);
    onUploaded();
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  const pendingCount = queue.filter((q) => q.status === 'pending').length;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">What kind of files are these?</label>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
          className="w-full rounded-md bg-ink-800 border border-ink-700 px-3 py-2 text-sm text-slate-100"
        >
          {SOURCE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragOver ? 'border-trust-500 bg-trust-600/10' : 'border-ink-700 hover:border-ink-600'
        }`}
      >
        <p className="text-sm text-slate-300">Drop your files here, or click to browse</p>
        <p className="text-xs text-slate-500 mt-1">PDF, Word, CSV, Excel, images, or JSON — add as many as you like</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)}
        />
      </div>

      {queue.length > 0 && (
        <ul className="space-y-1 max-h-32 overflow-y-auto text-xs">
          {queue.map((q, i) => (
            <li key={i} className="flex items-center justify-between text-slate-400">
              <span className="truncate">{q.file.name}</span>
              <span
                className={
                  q.status === 'done'
                    ? 'text-alert-low'
                    : q.status === 'error'
                      ? 'text-alert-high'
                      : q.status === 'uploading'
                        ? 'text-trust-400'
                        : 'text-slate-600'
                }
              >
                {q.status === 'pending' && 'Waiting'}
                {q.status === 'uploading' && 'Uploading…'}
                {q.status === 'done' && 'Added'}
                {q.status === 'error' && 'Failed'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {pendingCount > 0 && (
        <button
          onClick={uploadAll}
          disabled={uploading}
          className="w-full rounded-md bg-trust-600 text-white text-sm font-medium py-2.5 hover:bg-trust-700 disabled:opacity-50"
        >
          {uploading ? 'Adding files…' : `Add ${pendingCount} file${pendingCount === 1 ? '' : 's'} to this case`}
        </button>
      )}
    </div>
  );
}
