import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Case, CaseDocument, SocialPostMetadata } from '../types';

const PLATFORMS: { value: SocialPostMetadata['platform']; label: string; ring: string; badge: string }[] = [
  { value: 'instagram', label: 'Instagram', ring: 'from-fuchsia-500 to-amber-400', badge: 'text-fuchsia-600 bg-fuchsia-50' },
  { value: 'facebook', label: 'Facebook', ring: 'from-blue-500 to-blue-400', badge: 'text-blue-600 bg-blue-50' },
  { value: 'x', label: 'X', ring: 'from-slate-700 to-slate-500', badge: 'text-slate-700 bg-slate-100' },
  { value: 'whatsapp', label: 'WhatsApp', ring: 'from-emerald-500 to-emerald-400', badge: 'text-emerald-600 bg-emerald-50' },
];

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  UPLOADED: { label: 'Waiting to process', className: 'text-slate-400 bg-slate-100' },
  QUEUED: { label: 'Waiting to process', className: 'text-slate-400 bg-slate-100' },
  PROCESSING: { label: 'Reading…', className: 'text-blue-600 bg-blue-50' },
  PROCESSED: { label: 'Ready', className: 'text-emerald-600 bg-emerald-50' },
  FAILED: { label: 'Could not read', className: 'text-rose-600 bg-rose-50' },
};

const AVATAR_COLORS = [
  'bg-rose-400', 'bg-amber-400', 'bg-emerald-400', 'bg-sky-400', 'bg-violet-400', 'bg-fuchsia-400', 'bg-orange-400',
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function isSocialPost(doc: CaseDocument): doc is CaseDocument & { metadata: SocialPostMetadata } {
  return (doc.metadata as SocialPostMetadata | undefined)?.kind === 'social_post';
}

export default function SocialFeedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const caseId = searchParams.get('caseId') ?? '';
  const [cases, setCases] = useState<Case[]>([]);
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [platform, setPlatform] = useState<SocialPostMetadata['platform']>('instagram');
  const [author, setAuthor] = useState('');
  const [handle, setHandle] = useState('');
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    api.get('/cases').then((res) => {
      setCases(res.data);
      if (!caseId && res.data.length > 0) {
        setSearchParams({ caseId: res.data[0].id });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadDocuments() {
    if (!caseId) return;
    api.get(`/cases/${caseId}`).then((res) => setDocuments(res.data.documents ?? []));
  }

  useEffect(loadDocuments, [caseId]);

  // Live feel during a demo: a just-posted item is usually still UPLOADED/
  // PROCESSING, so poll briefly to catch it flipping to PROCESSED without
  // requiring a manual refresh.
  useEffect(() => {
    if (!caseId) return;
    const id = setInterval(loadDocuments, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const posts = useMemo(
    () =>
      documents
        .filter(isSocialPost)
        .sort((a, b) => new Date(b.metadata.postedAt).getTime() - new Date(a.metadata.postedAt).getTime()),
    [documents],
  );

  async function handlePost() {
    if (!caseId || !author.trim() || !caption.trim()) return;
    setPosting(true);
    try {
      const postedAt = new Date().toISOString();
      const metadata: SocialPostMetadata = {
        kind: 'social_post',
        platform,
        author: author.trim(),
        handle: handle.trim() || author.trim().toLowerCase().replace(/\s+/g, ''),
        caption: caption.trim(),
        postedAt,
      };
      const content = JSON.stringify({
        platform,
        author: metadata.author,
        handle: metadata.handle,
        caption: metadata.caption,
        posted_at: postedAt,
      });
      const form = new FormData();
      form.append('sourceType', 'OSINT');
      form.append('metadata', JSON.stringify(metadata));
      form.append('file', new Blob([content], { type: 'application/json' }), `social-post-${Date.now()}.json`);
      await api.post(`/cases/${caseId}/documents`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setCaption('');
      loadDocuments();
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="max-w-[470px] mx-auto px-4 py-3 flex items-center justify-center">
          <span className="font-serif text-lg text-slate-900">SocialSim</span>
        </div>
      </div>

      <div className="max-w-[470px] mx-auto px-4 pt-5 pb-16">
        {/* Composer */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-6 shadow-sm">
          <div className="flex gap-1.5 mb-3">
            {PLATFORMS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPlatform(p.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${
                  platform === p.value ? p.badge + ' border-transparent' : 'text-slate-400 border-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mb-2">
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Display name"
              className="flex-1 min-w-0 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400"
            />
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@handle (optional)"
              className="flex-1 min-w-0 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400"
            />
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write the post…"
            rows={3}
            className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm text-slate-800 placeholder:text-slate-400 resize-none"
          />
          <button
            onClick={handlePost}
            disabled={posting || !caseId || !author.trim() || !caption.trim()}
            className="mt-2 w-full rounded-md bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800 disabled:opacity-40"
          >
            {posting ? 'Posting…' : 'Post to feed'}
          </button>
        </div>

        {/* Feed */}
        {posts.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-10">No posts yet — write the first one above.</p>
        )}
        <div className="space-y-4">
          {posts.map((doc) => {
            const meta = doc.metadata as SocialPostMetadata;
            const platformInfo = PLATFORMS.find((p) => p.value === meta.platform) ?? PLATFORMS[0];
            const status = STATUS_LABEL[doc.status] ?? { label: doc.status, className: 'text-slate-400 bg-slate-100' };
            return (
              <div key={doc.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5">
                  <div className={`h-9 w-9 rounded-full p-[2px] bg-gradient-to-br ${platformInfo.ring} shrink-0`}>
                    <div className={`h-full w-full rounded-full ${avatarColor(meta.author)} flex items-center justify-center text-[11px] font-semibold text-white`}>
                      {initials(meta.author)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{meta.author}</p>
                    <p className="text-xs text-slate-400">@{meta.handle} · {timeAgo(meta.postedAt)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${platformInfo.badge}`}>
                    {platformInfo.label}
                  </span>
                </div>
                <p className="px-4 pb-3 text-[13.5px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {meta.caption}
                </p>
                <div className="px-4 pb-3.5 flex items-center justify-between border-t border-slate-100 pt-2.5">
                  <span className="text-xs text-slate-300">♡ like · ⤳ share</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
