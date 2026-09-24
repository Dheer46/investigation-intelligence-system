// Maps a free-text predicate produced by the relationship-extraction stage
// (e.g. "meet_in", "transfer_through") onto the fixed Neo4j relationship
// vocabulary from the architecture spec. The original predicate is always
// kept as a property on the edge for explainability, even when it collapses
// into a generic INVOLVED_IN.
const KEYWORD_TO_RELATIONSHIP: Array<[string, string]> = [
  ['call', 'CALLED'],
  ['meet', 'MET'],
  ['visit', 'VISITED'],
  ['transfer', 'TRANSACTED_WITH'],
  ['pay', 'TRANSACTED_WITH'],
  ['send', 'TRANSACTED_WITH'],
  ['own', 'OWNS'],
  ['member', 'MEMBER_OF'],
  ['belong', 'MEMBER_OF'],
  ['locate', 'LOCATED_AT'],
  ['live', 'LOCATED_AT'],
  ['reside', 'LOCATED_AT'],
];

export function mapPredicateToRelationshipType(predicate: string): string {
  const lower = predicate.toLowerCase();
  for (const [keyword, relType] of KEYWORD_TO_RELATIONSHIP) {
    if (lower.includes(keyword)) {
      return relType;
    }
  }
  return 'INVOLVED_IN';
}

const ENTITY_TYPE_TO_LABEL: Record<string, string> = {
  PERSON: 'Person',
  PHONE: 'Phone',
  VEHICLE: 'Vehicle',
  LOCATION: 'Location',
  ORGANIZATION: 'Organization',
  BANK_ACCOUNT: 'BankAccount',
  DATE: 'DateEntity',
  EVENT: 'Event',
};

export function mapEntityTypeToLabel(entityType: string): string {
  return ENTITY_TYPE_TO_LABEL[entityType] ?? 'Entity';
}
