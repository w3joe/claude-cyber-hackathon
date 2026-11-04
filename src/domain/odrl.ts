import type { Office, PolicyGraph, PolicyRule, RuleKind } from './types';

export const ODRL = 'http://www.w3.org/ns/odrl/2/';
export const MANDATE = 'urn:mandate:vocab:';
export const PROFILE = 'urn:mandate:profile:1';
export const XSD = 'http://www.w3.org/2001/XMLSchema#';
export const entityIri = (type: string, id: string) => `urn:mandate:${type}:${encodeURIComponent(id)}`;
export const ruleLabel: Record<RuleKind, string> = { obligation: 'Must', permission: 'May', prohibition: 'Must not' };
export const actions: Record<string, string> = {
  approveCampaign: 'approve a material campaign', checkMediaRights: 'check media licences and permissions',
  reviewAdministratorAccess: 'review administrator access', removeAccess: 'remove studio access',
  testRecovery: 'perform a recovery exercise', recordCustomerApproval: 'record customer approval',
  retainPermissionRecords: 'retain permission records', administerPublishing: 'administer publishing channels',
  publishUnapprovedCampaign: 'publish an unapproved campaign',
};
export const actionLabel = (iri: string) => actions[iri.replace(MANDATE, '')] ?? iri;

// Inline context: serialising and reading the supported form never fetches a remote context.
export const ODRL_CONTEXT = {
  odrl: ODRL, mandate: MANDATE, dcterms: 'http://purl.org/dc/terms/', uid: '@id',
  profile: { '@id': 'odrl:profile', '@type': '@id' },
  conflict: { '@id': 'odrl:conflict', '@type': '@id' },
  permission: { '@id': 'odrl:permission', '@container': '@set' },
  prohibition: { '@id': 'odrl:prohibition', '@container': '@set' },
  obligation: { '@id': 'odrl:obligation', '@container': '@set' },
  assignee: { '@id': 'odrl:assignee', '@type': '@id' },
  action: { '@id': 'odrl:action', '@type': '@id' },
  target: { '@id': 'odrl:target', '@type': '@id' },
  constraint: { '@id': 'odrl:constraint', '@container': '@set' },
  leftOperand: { '@id': 'odrl:leftOperand', '@type': '@id' },
  operator: { '@id': 'odrl:operator', '@type': '@id' }, rightOperand: 'odrl:rightOperand',
} as const;

export interface OdrlConstraint {
  leftOperand: string; operator: string; rightOperand: { '@value': string | boolean; '@type': string };
  'mandate:quote': string;
}
export interface OdrlRule {
  uid: string; '@type': 'odrl:Duty' | 'odrl:Permission' | 'odrl:Prohibition';
  assignee: string; action: string; target: string; constraint: OdrlConstraint[];
  'dcterms:source': { '@id': string }; 'mandate:quote': string;
  'mandate:assigneeQuote': string; 'mandate:actionQuote': string; 'mandate:targetQuote': string;
}
export interface OdrlPolicy {
  '@context': typeof ODRL_CONTEXT; '@type': 'odrl:Set'; uid: string; profile: string; conflict: string;
  'dcterms:title': string; obligation: OdrlRule[]; permission: OdrlRule[]; prohibition: OdrlRule[];
}
const ruleTypes = { obligation: 'odrl:Duty', permission: 'odrl:Permission', prohibition: 'odrl:Prohibition' } as const;
export function exportPolicies(graph: PolicyGraph): OdrlPolicy[] {
  const policies = graph.documents.map(document => {
    const policy: OdrlPolicy = {
      '@context': ODRL_CONTEXT, '@type': 'odrl:Set', uid: document.id, profile: PROFILE,
      conflict: `${ODRL}invalid`, 'dcterms:title': document.title, obligation: [], permission: [], prohibition: [],
    };
    for (const rule of graph.rules.filter(rule => graph.provisions.find(p => p.id === rule.provisionId)?.documentId === document.id)) {
      policy[rule.kind].push({
        uid: rule.id, '@type': ruleTypes[rule.kind], assignee: rule.assignee, action: rule.action, target: rule.target,
        constraint: rule.constraints.map(c => ({ leftOperand: c.leftOperand, operator: c.operator, rightOperand: { ...c.rightOperand }, 'mandate:quote': c.quote })),
        'dcterms:source': { '@id': rule.provisionId }, 'mandate:quote': rule.source.quote,
        'mandate:assigneeQuote': rule.source.assigneeQuote, 'mandate:actionQuote': rule.source.actionQuote,
        'mandate:targetQuote': rule.source.targetQuote,
      });
    }
    return policy;
  });
  return parsePolicies(JSON.stringify(policies));
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an ODRL object.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unsupported ODRL property: ${key}`);
}
function text(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Expected non-empty ODRL text.');
}
function iri(value: unknown): asserts value is string {
  text(value);
  if (!/^(urn:[a-z0-9][a-z0-9-]*:[^\s<>"{}|\\^`]+|https?:\/\/[^\s<>"{}|\\^`]+)$/i.test(value)) throw new Error(`Expected an absolute IRI: ${value}`);
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('Expected a bounded ODRL list.');
  return value;
}

/** Reads only the documented Mandate canonical JSON-LD subset, not arbitrary JSON-LD. */
export function parsePolicies(raw: string): OdrlPolicy[] {
  if (raw.length > 1_000_000) throw new Error('ODRL import exceeds 1 MB.');
  const input: unknown = JSON.parse(raw);
  const ids = new Set<string>();
  const unique = (value: unknown) => { iri(value); if (ids.has(value)) throw new Error(`Duplicate ODRL identifier: ${value}`); ids.add(value); };
  const policies = list(input);
  if (!policies.length) throw new Error('At least one policy is required.');
  for (const value of policies) {
    const policy = object(value);
    keys(policy, ['@context', '@type', 'uid', 'profile', 'conflict', 'dcterms:title', 'obligation', 'permission', 'prohibition']);
    // A changed context could silently change the meaning of every compact key.
    const context = object(policy['@context']);
    if (JSON.stringify(canonical(context)) !== JSON.stringify(canonical(ODRL_CONTEXT))) throw new Error('Unsupported ODRL context.');
    if (policy.profile !== PROFILE) throw new Error('Unsupported ODRL profile.');
    if (policy['@type'] !== 'odrl:Set' || policy.conflict !== `${ODRL}invalid`) throw new Error('Only Set policies with invalid-on-conflict are supported.');
    unique(policy.uid); text(policy['dcterms:title']);
    let count = 0;
    for (const kind of ['obligation', 'permission', 'prohibition'] as const) {
      for (const entry of list(policy[kind])) {
        count++;
        const rule = object(entry);
        keys(rule, ['uid', '@type', 'assignee', 'action', 'target', 'constraint', 'dcterms:source', 'mandate:quote', 'mandate:assigneeQuote', 'mandate:actionQuote', 'mandate:targetQuote']);
        unique(rule.uid);
        if (rule['@type'] !== ruleTypes[kind]) throw new Error('ODRL rule type does not match its relationship.');
        iri(rule.assignee); iri(rule.target); iri(rule.action);
        if (!Object.keys(actions).some(action => rule.action === `${MANDATE}${action}`)) throw new Error('Unsupported ODRL action.');
        const source = object(rule['dcterms:source']); keys(source, ['@id']); iri(source['@id']);
        for (const field of ['mandate:quote', 'mandate:assigneeQuote', 'mandate:actionQuote', 'mandate:targetQuote']) text(rule[field]);
        for (const entry of list(rule.constraint)) {
          const c = object(entry); keys(c, ['leftOperand', 'operator', 'rightOperand', 'mandate:quote']); text(c['mandate:quote']);
          const right = object(c.rightOperand); keys(right, ['@value', '@type']);
          const duration = right['@type'] === `${XSD}duration` && typeof right['@value'] === 'string' && /^P[1-9]\d*M$/.test(right['@value']);
          const valid = (c.leftOperand === `${MANDATE}maximumReviewInterval` && c.operator === `${ODRL}lteq` && duration)
            || (c.leftOperand === `${MANDATE}retentionPeriod` && c.operator === `${ODRL}gteq` && duration)
            || (c.leftOperand === `${MANDATE}beforeRelease` && c.operator === `${ODRL}eq` && right['@type'] === `${XSD}boolean` && right['@value'] === true);
          if (!valid) throw new Error('Unsupported ODRL constraint, operator or datatype.');
        }
      }
    }
    if (!count) throw new Error('An ODRL policy must contain at least one rule.');
  }
  // All fields have been checked; return a fresh value with no caller-owned references.
  return policies as unknown as OdrlPolicy[];
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}

export function validatePolicyGraph(office: Office): void {
  const graph = office.policyGraph;
  exportPolicies(graph);
  const allIds = [...graph.documents, ...graph.provisions, ...graph.definitions, ...graph.rules].map(item => item.id);
  if (new Set(allIds).size !== allIds.length) throw new Error('Duplicate policy graph identifier.');
  for (const id of allIds) iri(id);
  for (const provision of graph.provisions) {
    if (!graph.documents.some(d => d.id === provision.documentId)) throw new Error('Missing policy document.');
    if (provision.parentId && !graph.provisions.some(p => p.id === provision.parentId && p.documentId === provision.documentId)) throw new Error('Missing provision parent in document.');
    if (provision.refersTo.some(id => !graph.provisions.some(p => p.id === id))) throw new Error('Missing referenced provision.');
    const seen = new Set([provision.id]); let parent = provision.parentId;
    while (parent) {
      if (seen.has(parent)) throw new Error('Provision hierarchy cycle.');
      seen.add(parent); parent = graph.provisions.find(p => p.id === parent)?.parentId ?? null;
    }
  }
  for (const definition of graph.definitions) {
    if (!graph.provisions.some(p => p.id === definition.provisionId && p.text.includes(definition.meaning))) throw new Error('Definition is not grounded in its provision.');
    if (definition.mapsTo && !(definition.mapsTo.type === 'role' ? office.roles : office.systems).some(e => e.id === definition.mapsTo!.id)) throw new Error('Definition maps to a missing office entity.');
  }
  for (const rule of graph.rules) {
    const provision = graph.provisions.find(p => p.id === rule.provisionId);
    if (!provision || [...Object.values(rule.source), ...rule.constraints.map(c => c.quote)].some(quote => !quote.trim() || !provision.text.includes(quote))) throw new Error('Rule quote is not a substring of its source provision.');
  }
  const aligned = new Set<string>();
  for (const alignment of office.ruleAlignments) {
    if (aligned.has(alignment.ruleId)) throw new Error('Duplicate rule alignment.');
    aligned.add(alignment.ruleId);
    const rule = graph.rules.find(r => r.id === alignment.ruleId);
    if (!rule) throw new Error('Alignment references a missing rule.');
    if (alignment.state !== 'confirmed') continue;
    if (!office.roles.some(r => r.id === alignment.roleId) || rule.assignee !== entityIri('role', alignment.roleId)) throw new Error('Confirmed assignee does not match an office role.');
    if (!alignment.systemIds.some(id => entityIri('system', id) === rule.target) || alignment.systemIds.some(id => !office.systems.some(s => s.id === id))) throw new Error('Confirmed target references a missing system.');
    if (!alignment.controlIds.length || alignment.controlIds.some(id => !office.controls.some(c => c.id === id))) throw new Error('Confirmed alignment references a missing control.');
  }
}

export function ruleSourceLabel(graph: PolicyGraph, rule: PolicyRule): string {
  const provision = graph.provisions.find(p => p.id === rule.provisionId);
  return `${graph.documents.find(d => d.id === provision?.documentId)?.reference ?? 'Policy'} ${provision?.label ?? ''}`.trim();
}
