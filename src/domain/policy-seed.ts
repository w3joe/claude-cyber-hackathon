import { entityIri, MANDATE, ODRL, XSD } from './odrl';
import type { PolicyConstraint, PolicyGraph, PolicyRule, Requirement, RuleAlignment } from './types';

const doc = (id: string) => entityIri('policy', id);
const clause = (id: string) => entityIri('provision', id);
const beforeRelease: PolicyConstraint = { leftOperand: `${MANDATE}beforeRelease`, operator: `${ODRL}eq`, rightOperand: { '@value': true, '@type': `${XSD}boolean` }, quote: 'before release' };
const specs: { id: string; document: string; label: string; requirementId: string; name: string; text: string; role: string; action: string; target: string; actionQuote: string; targetQuote: string; constraints?: PolicyConstraint[]; control: string }[] = [
  { id: 'POL-01-3', document: 'POL-01', label: '§3', requirementId: 'release-policy', name: 'Authorised material release', text: 'The Head of Media must approve material campaigns before release and record the decision.', role: 'head-media', action: 'approveCampaign', target: 'campaign-board', actionQuote: 'approve', targetQuote: 'material campaigns', constraints: [beforeRelease], control: 'campaign-approval' },
  { id: 'SOW-04-5', document: 'SOW-04', label: '§5', requirementId: 'media-permissions', name: 'Permitted customer media use', text: 'The Head of Media must check media licences and permissions for customer media in the Asset Library.', role: 'head-media', action: 'checkMediaRights', target: 'asset-library', actionQuote: 'check media licences and permissions', targetQuote: 'customer media in the Asset Library', control: 'media-rights' },
  { id: 'POL-02-2', document: 'POL-02', label: '§2', requirementId: 'access-policy', name: 'Controlled account access', text: 'The IT Lead must remove studio access for departed colleagues using the Identity Console and record completion.', role: 'it-lead', action: 'removeAccess', target: 'identity-console', actionQuote: 'remove studio access', targetQuote: 'Identity Console', control: 'access-removal' },
  { id: 'POL-03-2', document: 'POL-03', label: '§2', requirementId: 'recovery-policy', name: 'Demonstrated asset recovery', text: 'The Operations Lead must perform a recovery exercise for the Asset Library and retain current evidence.', role: 'operations-lead', action: 'testRecovery', target: 'asset-library', actionQuote: 'perform a recovery exercise', targetQuote: 'Asset Library', control: 'recovery-test' },
  { id: 'SOW-04-4', document: 'SOW-04', label: '§4', requirementId: 'customer-approval', name: 'Customer approval before release', text: 'The Client Lead must record customer approval for material campaigns before release.', role: 'client-lead', action: 'recordCustomerApproval', target: 'campaign-board', actionQuote: 'record customer approval', targetQuote: 'material campaigns', constraints: [beforeRelease], control: 'customer-signoff' },
];
const roleNames: Record<string, string> = { 'head-media': 'Head of Media', 'it-lead': 'IT Lead', 'operations-lead': 'Operations Lead', 'client-lead': 'Client Lead' };
export const policyGraph: PolicyGraph = {
  documents: [
    { id: doc('POL-01'), title: 'Material campaign release', source: 'Internal policy', reference: 'DEMO-POL-01' },
    { id: doc('POL-02'), title: 'Account access', source: 'Internal policy', reference: 'DEMO-POL-02' },
    { id: doc('POL-03'), title: 'Asset recovery', source: 'Internal policy', reference: 'DEMO-POL-03' },
    { id: doc('SOW-04'), title: 'Customer media commitments', source: 'Customer commitment', reference: 'DEMO-SOW-04' },
  ],
  provisions: [
    ...specs.map(s => ({ id: clause(s.id), documentId: doc(s.document), parentId: s.document === 'POL-02' ? clause('POL-02-access') : null, label: s.label, text: s.text, refersTo: [], ...(s.document === 'POL-02' ? {} : { requirement: { id: s.requirementId, name: s.name } }) })).flatMap(p => p.id === clause('POL-02-2') ? [{ id: clause('POL-02-access'), documentId: doc('POL-02'), parentId: null, label: '§2–4', text: 'Named owners review publishing administrators and record removal of studio access.', refersTo: [], requirement: { id: 'access-policy', name: 'Controlled account access' } }, p] : [p]),
    { id: clause('POL-01-1'), documentId: doc('POL-01'), parentId: null, label: '§1', text: 'Material campaign means a customer campaign whose release decision is recorded in the Campaign Board.', refersTo: [] },
    { id: clause('POL-02-3'), documentId: doc('POL-02'), parentId: clause('POL-02-access'), label: '§3', text: 'The Head of Media must review administrator access to customer publishing channels at least quarterly.', refersTo: [] },
    { id: clause('POL-02-4'), documentId: doc('POL-02'), parentId: clause('POL-02-access'), label: '§4', text: 'Studio access removal must follow §2. The Head of Media may administer customer publishing channels.', refersTo: [clause('POL-02-2')] },
    { id: clause('SOW-04-5.2'), documentId: doc('SOW-04'), parentId: clause('SOW-04-5'), label: '§5.2', text: 'The Head of Media must retain permission records in the Asset Library for at least 24 months.', refersTo: [] },
    { id: clause('POL-01-3.1'), documentId: doc('POL-01'), parentId: clause('POL-01-3'), label: '§3.1', text: 'The Head of Media must not publish an unapproved campaign from the Campaign Board.', refersTo: [] },
  ],
  definitions: [{ id: entityIri('definition', 'material-campaign'), provisionId: clause('POL-01-1'), term: 'Material campaign', meaning: 'a customer campaign whose release decision is recorded in the Campaign Board', mapsTo: { type: 'system', id: 'campaign-board' } }],
  rules: specs.map(s => ({
    id: entityIri('rule', s.id), provisionId: clause(s.id), kind: 'obligation', assignee: entityIri('role', s.role), action: `${MANDATE}${s.action}`, target: entityIri('system', s.target), constraints: s.constraints ?? [],
    source: { quote: s.text, assigneeQuote: roleNames[s.role], actionQuote: s.actionQuote, targetQuote: s.targetQuote },
  })),
};
function extra(id: string, kind: PolicyRule['kind'], action: string, target: string, actionQuote: string, targetQuote: string, constraints: PolicyConstraint[] = []) {
  const provision = policyGraph.provisions.find(p => p.id === clause(id))!;
  policyGraph.rules.push({ id: entityIri('rule', id), provisionId: provision.id, kind, assignee: entityIri('role', 'head-media'), action: `${MANDATE}${action}`, target: entityIri('system', target), constraints, source: { quote: provision.text, assigneeQuote: 'Head of Media', actionQuote, targetQuote } });
}
extra('POL-02-3', 'obligation', 'reviewAdministratorAccess', 'publishing-console', 'review administrator access', 'customer publishing channels', [{ leftOperand: `${MANDATE}maximumReviewInterval`, operator: `${ODRL}lteq`, rightOperand: { '@value': 'P3M', '@type': `${XSD}duration` }, quote: 'at least quarterly' }]);
extra('POL-02-4', 'permission', 'administerPublishing', 'publishing-console', 'administer', 'customer publishing channels');
extra('SOW-04-5.2', 'obligation', 'retainPermissionRecords', 'asset-library', 'retain permission records', 'Asset Library', [{ leftOperand: `${MANDATE}retentionPeriod`, operator: `${ODRL}gteq`, rightOperand: { '@value': 'P24M', '@type': `${XSD}duration` }, quote: 'at least 24 months' }]);
extra('POL-01-3.1', 'prohibition', 'publishUnapprovedCampaign', 'campaign-board', 'publish an unapproved campaign', 'Campaign Board');

export const ruleAlignments: RuleAlignment[] = [
  ...specs.map(s => ({ ruleId: entityIri('rule', s.id), roleId: s.role, systemIds: [s.target], controlIds: [s.control], state: 'confirmed' as const })),
  { ruleId: entityIri('rule', 'POL-02-3'), roleId: 'head-media', systemIds: ['publishing-console'], controlIds: ['publisher-review'], state: 'confirmed' },
  { ruleId: entityIri('rule', 'POL-02-4'), roleId: 'head-media', systemIds: ['publishing-console'], controlIds: ['publisher-review'], state: 'confirmed' },
  { ruleId: entityIri('rule', 'SOW-04-5.2'), roleId: 'head-media', systemIds: ['asset-library'], controlIds: [], state: 'unmatched' },
  { ruleId: entityIri('rule', 'POL-01-3.1'), roleId: 'head-media', systemIds: ['campaign-board'], controlIds: ['campaign-approval'], state: 'confirmed' },
];

export function requirementViews(graph: PolicyGraph): Requirement[] {
  return graph.provisions.filter(p => p.requirement).map(p => {
    const document = graph.documents.find(d => d.id === p.documentId)!;
    return { id: p.requirement!.id, name: p.requirement!.name, provisionId: p.id, description: p.text, source: document.source, reference: `${document.reference} ${p.label}` };
  });
}
