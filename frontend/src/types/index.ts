export interface Case {
  id: string;
  caseNumber: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  _count?: { documents: number; hypotheses: number };
}

export interface CaseDocument {
  id: string;
  caseId: string;
  sourceType: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  uploadedAt: string;
  processedAt: string | null;
  metadata?: SocialPostMetadata | Record<string, unknown> | null;
}

export interface SocialPostMetadata {
  kind: 'social_post';
  platform: 'instagram' | 'facebook' | 'x' | 'whatsapp';
  author: string;
  handle: string;
  caption: string;
  postedAt: string;
}

export interface DashboardMetrics {
  totalCases: number;
  entitiesExtracted: number;
  relationshipsFound: number;
  pendingReviewCandidates: number;
  pendingHypotheses: number;
  potentialHiddenLinks: number;
  communitiesDetected: number;
  highPriorityAlerts: number;
}

export interface ReviewCandidate {
  id: string;
  caseId: string;
  entityType: string;
  canonicalName: string;
  memberEntityIds: string[];
  matchScore: number;
  decision: 'PENDING' | 'APPROVED' | 'REJECTED';
  case: { id: string; caseNumber: string; title: string };
}

export interface GraphElements {
  elements: {
    nodes: { data: { id: string; label: string; entityType: string; nodeLabel: string } }[];
    edges: {
      data: {
        id: string;
        source: string;
        target: string;
        label: string;
        rawPredicate: string;
        confidence: number;
        locationRef: string | null;
      };
    }[];
  };
}

export interface EvidenceMention {
  mentionId: string;
  rawText: string;
  normalized: string | null;
  confidence: number;
  locationRef: string | null;
  document: { id: string; originalName: string; sourceType: string; caseId: string };
}

export interface Hypothesis {
  id: string;
  caseId: string;
  hypothesisText: string;
  evidenceSummary: {
    type: 'HIDDEN_LINK' | 'COMMUNITY' | 'ANOMALY';
    subtype?: string;
    [key: string]: unknown;
  };
  confidence: number;
  status: 'PENDING_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'ESCALATED';
  provenance: {
    algorithm: string;
    algorithmVersion: string;
    graphNodeIds: string[];
    computedAt: string;
  };
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actor: { id: string; fullName: string; role: string } | null;
  action: string;
  targetType: string;
  targetId: string;
  caseId: string | null;
  case: { id: string; caseNumber: string; title: string } | null;
  result: string;
  provenance: Record<string, unknown> | null;
  createdAt: string;
  ledgerAnchor: { ledgerTxId: string; verified: boolean } | null;
}

export interface ReconstructionBeat {
  id: string;
  documentId: string;
  documentName: string;
  sourceType: string;
  text: string;
  date: string | null;
  people: string[];
  locations: string[];
  organizations: string[];
}

export interface TopConnector {
  id: string;
  name: string;
  entityType: string;
  pagerank: number;
  betweenness: number;
  degree: number;
}
