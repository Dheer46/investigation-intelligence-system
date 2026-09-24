import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Node, Relationship } from 'neo4j-driver';
import { PrismaService } from '../prisma/prisma.service';
import { Neo4jService } from '../common/neo4j.service';
import { AuditLogService } from '../audit/audit-log.service';
import { mapEntityTypeToLabel, mapPredicateToRelationshipType } from './predicate-mapping';

interface GraphNodeData {
  id: string;
  label: string;
  entityType: string;
  name: string;
}

interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  type: string;
  rawPredicate: string;
  confidence: number;
  locationRef: string | null;
}

// Case reconstruction only makes sense from documents that narrate events in
// prose (FIRs, intel reports, OSINT) - CDR/financial spreadsheet rows are
// tabular ("col: val | col: val") and never parse into a subject+verb+object
// relation in the first place, so they're excluded rather than filtered here.
const NARRATIVE_SOURCE_TYPES = new Set(['FIR', 'INTELLIGENCE_REPORT', 'OSINT', 'OTHER']);
const TAGGABLE_ENTITY_TYPES = new Set(['PERSON', 'LOCATION', 'ORGANIZATION']);

// Matches the dd/mm/yyyy (or dd-mm-yyyy) convention used throughout Indian
// police/intel documents. Deliberately narrow - a wrong guess (e.g. treating
// a case/FIR number as a date) is worse than leaving a beat undated, since
// undated beats still render, just without a date badge.
const DATE_PATTERN = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/;

// The MVP NER pass (see relation_extraction.py) tags plenty of real names
// correctly, but also mistags short domain acronyms and a handful of common
// nouns as ORGANIZATION/LOCATION ("P.S.", "IPC", "Subscriber", "Page"...).
// Filtering those out of the reconstruction's tag chips is worth doing here
// (a display concern) without touching the NER model itself.
const ACRONYM_TAG_PATTERN = /^[A-Z][A-Z.]{1,7}$/;
const NOISE_TAGS = new Set([
  'subscriber',
  'evidence',
  'page',
  'reply',
  'mobile',
  'complaint',
  'complainant',
  'fir no.',
  'fir no',
]);

function isNoiseTag(name: string): boolean {
  const trimmed = name.trim();
  return ACRONYM_TAG_PATTERN.test(trimmed) || NOISE_TAGS.has(trimmed.toLowerCase());
}

function extractEventDate(text: string): string | null {
  const match = text.match(DATE_PATTERN);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3];
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly neo4j: Neo4jService,
    private readonly auditLog: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  // Same rationale as ResolutionService.triggerResolution: the frontend has
  // no way to reach the ai-service on its own, so "who can kick off an
  // analytics run" is enforced by this endpoint's JWT+RBAC guard, not by the
  // ai-service (which trusts any caller on the internal network).
  async triggerAnalytics(caseId: string, actorId: string, actorRole: string) {
    const caseRecord = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }
    const aiServiceUrl = this.config.get<string>('AI_SERVICE_URL', 'http://ai-service:8000');
    const response = await fetch(`${aiServiceUrl}/analytics/cases/${caseId}/run`, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`ai-service analytics trigger failed: ${response.status}`);
    }
    const result = await response.json();
    await this.auditLog.log({
      actorId,
      actorRole,
      action: 'ANALYTICS_RUN',
      targetType: 'Case',
      targetId: caseId,
      caseId,
      result: 'SUCCESS',
      provenance: result,
    });
    return result;
  }

  async syncCaseToGraph(caseId: string) {
    const caseRecord = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }

    const entities = await this.prisma.extractedEntity.findMany({
      where: { document: { caseId } },
      include: { resolvedEntity: true },
    });
    const relations = await this.prisma.extractedRelation.findMany({
      where: { document: { caseId } },
    });

    // node id: the resolved canonical entity if this mention has been merged,
    // otherwise the raw mention itself stands in as its own (unresolved) node.
    const nodeIdFor = (entity: (typeof entities)[number]) => entity.resolvedEntityId ?? entity.id;

    const nodesById = new Map<string, GraphNodeData>();
    for (const entity of entities) {
      if (entity.entityType === 'DATE' || entity.entityType === 'EVENT') {
        continue; // not identity-bearing; not rendered as graph nodes
      }
      const id = nodeIdFor(entity);
      if (!nodesById.has(id)) {
        nodesById.set(id, {
          id,
          label: mapEntityTypeToLabel(entity.entityType),
          entityType: entity.entityType,
          name: entity.resolvedEntity?.canonicalName ?? entity.normalized ?? entity.rawText,
        });
      }
    }

    // Relations only carry free-text subject/object - resolve each back to the
    // extracted entity mention (and its graph node id) from the same document
    // by best-effort text matching, since the two extraction passes are
    // independent (see app/relationships in the ai-service).
    const entitiesByDocument = new Map<string, (typeof entities)[number][]>();
    for (const entity of entities) {
      const list = entitiesByDocument.get(entity.documentId) ?? [];
      list.push(entity);
      entitiesByDocument.set(entity.documentId, list);
    }

    const findEntityForText = (documentId: string, text: string) => {
      const candidates = entitiesByDocument.get(documentId) ?? [];
      const target = text.trim().toLowerCase();
      const exact = candidates.find((e) => e.rawText.trim().toLowerCase() === target);
      if (exact) return exact;
      const containing = candidates
        .filter((e) => target.includes(e.rawText.trim().toLowerCase()) || e.rawText.trim().toLowerCase().includes(target))
        .sort((a, b) => b.rawText.length - a.rawText.length);
      return containing[0];
    };

    const edges: GraphEdgeData[] = [];
    for (const relation of relations) {
      const subjectEntity = findEntityForText(relation.documentId, relation.subjectText);
      const objectEntity = findEntityForText(relation.documentId, relation.objectText);
      if (!subjectEntity || !objectEntity) continue;

      const sourceId = nodeIdFor(subjectEntity);
      const targetId = nodeIdFor(objectEntity);
      if (!nodesById.has(sourceId) || !nodesById.has(targetId) || sourceId === targetId) continue;

      edges.push({
        id: relation.id,
        source: sourceId,
        target: targetId,
        type: mapPredicateToRelationshipType(relation.predicate),
        rawPredicate: relation.predicate,
        confidence: relation.confidence,
        locationRef: relation.locationRef,
      });
    }

    // Snapshot analytics-derived properties (Phase 6 writes these onto nodes
    // via GDS) before rebuilding, so a re-sync after a new upload doesn't
    // silently erase the last analytics run's centrality/community scores.
    const analyticsSnapshot = new Map<string, Record<string, unknown>>();
    const snapshotResult = await this.neo4j.run(
      `MATCH (c:Case {id: $caseId})<-[:INVOLVED_IN]-(n)
       RETURN n.id AS id, n.pagerank AS pagerank, n.betweenness AS betweenness,
              n.degreeCentrality AS degreeCentrality, n.communityId AS communityId`,
      { caseId },
    );
    for (const record of snapshotResult.records) {
      analyticsSnapshot.set(String(record.get('id')), {
        pagerank: record.get('pagerank'),
        betweenness: record.get('betweenness'),
        degreeCentrality: record.get('degreeCentrality'),
        communityId: record.get('communityId'),
      });
    }

    // Full rebuild of this case's subgraph keeps sync idempotent and avoids
    // orphaned duplicate nodes left behind after an entity-resolution merge.
    await this.neo4j.run(
      'MATCH (c:Case {id: $caseId})<-[:INVOLVED_IN]-(n) DETACH DELETE n',
      { caseId },
    );
    await this.neo4j.run('MERGE (c:Case {id: $caseId}) SET c.caseNumber = $caseNumber, c.title = $title', {
      caseId,
      caseNumber: caseRecord.caseNumber,
      title: caseRecord.title,
    });

    for (const node of nodesById.values()) {
      await this.neo4j.run(
        `CALL apoc.merge.node([$label], {id: $id}, {name: $name, entityType: $entityType}, {}) YIELD node
         WITH node MATCH (c:Case {id: $caseId})
         MERGE (node)-[:INVOLVED_IN]->(c)`,
        { label: node.label, id: node.id, name: node.name, entityType: node.entityType, caseId },
      );
      const priorAnalytics = analyticsSnapshot.get(node.id);
      if (priorAnalytics && Object.values(priorAnalytics).some((v) => v !== null && v !== undefined)) {
        await this.neo4j.run('MATCH (n {id: $id}) SET n += $props', { id: node.id, props: priorAnalytics });
      }
    }

    for (const edge of edges) {
      await this.neo4j.run(
        `MATCH (a {id: $source}), (b {id: $target})
         CALL apoc.merge.relationship(
           a, $type, {caseId: $caseId, sourceRelationId: $edgeId},
           {rawPredicate: $rawPredicate, confidence: $confidence, locationRef: $locationRef},
           b, {}
         ) YIELD rel
         RETURN rel`,
        {
          source: edge.source,
          target: edge.target,
          type: edge.type,
          caseId,
          edgeId: edge.id,
          rawPredicate: edge.rawPredicate,
          confidence: edge.confidence,
          locationRef: edge.locationRef,
        },
      );
    }

    this.logger.log(`Synced case ${caseId} to Neo4j: ${nodesById.size} nodes, ${edges.length} edges`);
    return { nodes: nodesById.size, edges: edges.length };
  }

  async getCaseGraph(caseId: string) {
    const result = await this.neo4j.run(
      `MATCH (c:Case {id: $caseId})<-[:INVOLVED_IN]-(n)
       OPTIONAL MATCH (n)-[r]->(m) WHERE (m)-[:INVOLVED_IN]->(c)
       RETURN n, r, m`,
      { caseId },
    );

    const nodeElements = new Map<string, unknown>();
    const edgeElements = new Map<string, unknown>();

    const toNodeElement = (node: Node) => ({
      data: {
        id: node.properties.id,
        label: node.properties.name,
        entityType: node.properties.entityType,
        nodeLabel: node.labels[0],
        communityId: node.properties.communityId ?? null,
        pagerank: node.properties.pagerank ?? 0,
        betweenness: node.properties.betweenness ?? 0,
      },
    });

    for (const record of result.records) {
      const n = record.get('n') as Node;
      nodeElements.set(String(n.properties.id), toNodeElement(n));

      const r = record.get('r') as Relationship | null;
      const m = record.get('m') as Node | null;
      if (r && m) {
        nodeElements.set(String(m.properties.id), toNodeElement(m));
        const edgeId = r.elementId ?? `${r.identity}`;
        edgeElements.set(edgeId, {
          data: {
            id: edgeId,
            source: String(n.properties.id),
            target: String(m.properties.id),
            label: r.type,
            rawPredicate: r.properties.rawPredicate,
            confidence: r.properties.confidence,
            locationRef: r.properties.locationRef,
          },
        });
      }
    }

    return {
      elements: {
        nodes: Array.from(nodeElements.values()),
        edges: Array.from(edgeElements.values()),
      },
    };
  }

  // "Search Entity" dashboard feature: look across both resolved (canonical)
  // entities and not-yet-resolved raw mentions by name/type.
  async searchEntities(query: string) {
    const [resolved, unresolved] = await Promise.all([
      this.prisma.resolvedEntity.findMany({
        where: { canonicalName: { contains: query, mode: 'insensitive' } },
        take: 25,
      }),
      this.prisma.extractedEntity.findMany({
        where: {
          resolvedEntityId: null,
          OR: [
            { rawText: { contains: query, mode: 'insensitive' } },
            { normalized: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: { document: { select: { caseId: true } } },
        take: 25,
      }),
    ]);

    return [
      ...resolved.map((r) => ({
        id: r.id,
        name: r.canonicalName,
        entityType: r.entityType,
        resolved: true,
      })),
      ...unresolved.map((e) => ({
        id: e.id,
        name: e.normalized ?? e.rawText,
        entityType: e.entityType,
        resolved: false,
        caseId: e.document.caseId,
      })),
    ];
  }

  // "View Evidence" dashboard feature: every mention backing a (possibly
  // merged) entity, with the document + provenance anchor it came from.
  async getEntityEvidence(nodeId: string) {
    const mentions = await this.prisma.extractedEntity.findMany({
      where: { OR: [{ id: nodeId }, { resolvedEntityId: nodeId }] },
      include: {
        document: {
          select: { id: true, originalName: true, sourceType: true, caseId: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (mentions.length === 0) {
      throw new NotFoundException(`No entity or resolved entity found for ${nodeId}`);
    }
    return mentions.map((m) => ({
      mentionId: m.id,
      rawText: m.rawText,
      normalized: m.normalized,
      confidence: m.confidence,
      locationRef: m.locationRef,
      document: m.document,
    }));
  }

  // "How it unfolded" reconstruction: turns the same narrative sentences the
  // relation-extraction stage already parsed (FIR/intel-report/OSINT prose)
  // into a chronological set of plain-language "beats", each tagged with the
  // people/places it mentions - no separate NLP pass, just a different read
  // of extracted_relations + extracted_entities than the graph sync does.
  async getReconstruction(caseId: string): Promise<{ caseId: string; beats: ReconstructionBeat[] }> {
    const caseRecord = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }

    const [relations, entities] = await Promise.all([
      this.prisma.extractedRelation.findMany({
        where: { document: { caseId } },
        include: { document: { select: { id: true, originalName: true, sourceType: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.extractedEntity.findMany({
        where: { document: { caseId }, entityType: { in: Array.from(TAGGABLE_ENTITY_TYPES) } },
        include: { resolvedEntity: true },
      }),
    ]);

    const entitiesByDocument = new Map<string, typeof entities>();
    for (const entity of entities) {
      const list = entitiesByDocument.get(entity.documentId) ?? [];
      list.push(entity);
      entitiesByDocument.set(entity.documentId, list);
    }

    const seenSentences = new Set<string>();
    const beats: (ReconstructionBeat & { order: number })[] = [];
    let order = 0;

    for (const relation of relations) {
      if (!NARRATIVE_SOURCE_TYPES.has(relation.document.sourceType)) continue;

      const text = relation.sourceText.trim();
      if (text.length < 20) continue; // too short to be a real narrative beat

      const dedupeKey = `${relation.documentId}::${text}`;
      if (seenSentences.has(dedupeKey)) continue;
      seenSentences.add(dedupeKey);

      const lowerText = text.toLowerCase();
      const people = new Set<string>();
      const locations = new Set<string>();
      const organizations = new Set<string>();
      for (const entity of entitiesByDocument.get(relation.documentId) ?? []) {
        const raw = entity.rawText.trim();
        if (raw.length < 3 || !lowerText.includes(raw.toLowerCase())) continue;
        // The dependency-parse subtree extraction (relation_extraction.py)
        // sometimes swallows a trailing possessive ("Kamla Devi's phone") into
        // the entity span - strip it here so tag chips read as a name, not a
        // grammatical fragment.
        const name = (entity.resolvedEntity?.canonicalName ?? entity.normalized ?? raw).replace(/['’]s$/i, '');
        if (isNoiseTag(name)) continue;
        if (entity.entityType === 'PERSON') people.add(name);
        else if (entity.entityType === 'LOCATION') locations.add(name);
        else if (entity.entityType === 'ORGANIZATION') organizations.add(name);
      }

      const date = extractEventDate(text);
      // A dated beat earns its place in the timeline by the date alone. An
      // undated one only adds value if it says who it's about - otherwise
      // it's procedural filler ("Case registered under Section 363 IPC")
      // competing for attention with the real narrative in the fallback list.
      if (!date && people.size === 0) {
        continue;
      }

      beats.push({
        id: relation.id,
        documentId: relation.documentId,
        documentName: relation.document.originalName,
        sourceType: relation.document.sourceType,
        text,
        date,
        people: Array.from(people),
        locations: Array.from(locations),
        organizations: Array.from(organizations),
        order: order++,
      });
    }

    beats.sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      return a.order - b.order;
    });

    return { caseId, beats: beats.map(({ order: _order, ...beat }) => beat) };
  }

  async getDashboardMetrics() {
    const [totalCases, entitiesExtracted, relationshipsFound, pendingReview, hypothesisCounts] =
      await Promise.all([
        this.prisma.case.count(),
        this.prisma.extractedEntity.count(),
        this.prisma.extractedRelation.count(),
        this.prisma.entityResolutionCandidate.count({ where: { decision: 'PENDING' } }),
        this.prisma.hypothesis.groupBy({
          by: ['status'],
          where: { status: 'PENDING_REVIEW' },
          _count: true,
        }),
      ]);

    const [hiddenLinks, communities, highPriority] = await Promise.all([
      this.prisma.hypothesis.count({
        where: { status: 'PENDING_REVIEW', evidenceSummary: { path: ['type'], equals: 'HIDDEN_LINK' } },
      }),
      this.prisma.hypothesis.count({
        where: { status: 'PENDING_REVIEW', evidenceSummary: { path: ['type'], equals: 'COMMUNITY' } },
      }),
      this.prisma.hypothesis.count({
        where: {
          status: 'PENDING_REVIEW',
          evidenceSummary: { path: ['type'], equals: 'ANOMALY' },
          confidence: { gte: 0.65 },
        },
      }),
    ]);

    return {
      totalCases,
      entitiesExtracted,
      relationshipsFound,
      pendingReviewCandidates: pendingReview,
      pendingHypotheses: hypothesisCounts.reduce((sum, g) => sum + g._count, 0),
      potentialHiddenLinks: hiddenLinks,
      communitiesDetected: communities,
      highPriorityAlerts: highPriority,
    };
  }

  // "Top Network Connectors" dashboard feature: reads the centrality
  // properties the ai-service's analytics run wrote onto each node.
  async getTopConnectors(caseId: string, limit = 10) {
    const result = await this.neo4j.run(
      `MATCH (c:Case {id: $caseId})<-[:INVOLVED_IN]-(n)
       RETURN n.id AS id, n.name AS name, n.entityType AS entityType,
              coalesce(n.pagerank, 0.0) AS pagerank,
              coalesce(n.betweenness, 0.0) AS betweenness,
              coalesce(n.degreeCentrality, 0.0) AS degree
       ORDER BY betweenness DESC, pagerank DESC
       LIMIT $limit`,
      { caseId, limit: neo4j.int(limit) },
    );
    return result.records.map((record) => ({
      id: record.get('id'),
      name: record.get('name'),
      entityType: record.get('entityType'),
      pagerank: record.get('pagerank'),
      betweenness: record.get('betweenness'),
      degree: record.get('degree'),
    }));
  }
}
