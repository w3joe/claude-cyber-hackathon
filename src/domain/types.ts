export type Status = 'covered' | 'at-risk' | 'unowned' | 'proposed' | 'verified' | 'unknown' | 'inactive';
export type EntityType = 'person' | 'role' | 'system' | 'control' | 'requirement';
export type Category = 'governance' | 'risk' | 'compliance';
export interface Person { id: string; name: string; title: string; department: string; active: boolean; skills: string[]; }
export interface Role { id: string; name: string; description: string; ownerId: string | null; deputyIds: string[]; eligiblePersonIds: string[]; accountableRoleId: string | null; }
export interface System { id: string; name: string; description: string; roleId: string; }
export interface Control { id: string; name: string; description: string; category: Category; roleId: string; systemIds: string[]; requirementIds: string[]; evidence: { status: 'current' | 'missing' | 'stale'; reference: string; checkedAt: string }; }
export interface Requirement { provisionId: string; id: string; name: string; description: string; source: 'Internal policy' | 'Customer commitment'; reference: string; }
export interface Office { id: string; name: string; description: string; people: Person[]; roles: Role[]; systems: System[]; controls: Control[]; requirements: Requirement[]; policyGraph: PolicyGraph; ruleAlignments: RuleAlignment[]; }
export interface Scenario { id: string; kind: 'baseline' | 'leave' | 'join' | 'move'; personId?: string; targetRoleId?: string; newPerson?: Person; createdAt: string; }
export interface Repair { id: string; roleId: string; candidateId: string; status: 'proposed' | 'confirmed'; authorisedById: string; ownerAccepted: boolean; authorityConfirmed: boolean; accessConfirmed: boolean; evidence: string; createdAt: string; }
export interface Plan { schemaVersion: 1; scenario: Scenario; repairs: Repair[]; }
export interface GraphNode { id: string; type: EntityType; label: string; subtitle: string; description: string; status: Status; affected: boolean; reason: string; entityId: string; }
export interface GraphEdge { id: string; source: string; target: string; label: string; affected: boolean; }
export interface Candidate { personId: string; name: string; kind: 'authorised-deputy' | 'eligible' | 'new-starter'; reason: string; requiresAuthorisation: boolean; }
export interface RoleImpact { roleId: string; name: string; status: Status; baselineOwnerId: string | null; ownerId: string | null; accountablePersonId: string | null; reason: string; candidates: Candidate[]; repair?: Repair; }
export interface Finding { id: string; category: Category; title: string; description: string; status: Status; roleId: string; controlId?: string; requirementIds: string[]; nodeIds: string[]; accountablePersonId: string | null; action: string; evidenceNeeded: string; }
export interface RequirementImpact { requirementId: string; name: string; status: Status; controlIds: string[]; reason: string; }
export interface Snapshot { office: Office; plan: Plan; people: Person[]; nodes: GraphNode[]; edges: GraphEdge[]; roles: RoleImpact[]; findings: Finding[]; requirements: RequirementImpact[]; rules: RuleImpact[]; affectedNodeIds: string[]; summary: { affected: number; unowned: number; proposed: number; verified: number; requirementsAtRisk: number }; scenarioLabel: string; }
export interface QuestionAnswer { title: string; text: string; bullets: string[]; nodeIds: string[]; suggestedScenario?: Scenario; }

/** ODRL semantics; office coverage and confirmation are separate assessment data. */
export type RuleKind = 'obligation' | 'permission' | 'prohibition';
export interface PolicyDocument { id: string; title: string; source: Requirement['source']; reference: string; }
export interface Provision { id: string; documentId: string; parentId: string | null; label: string; text: string; refersTo: string[]; requirement?: { id: string; name: string }; }
export interface Definition { id: string; provisionId: string; term: string; meaning: string; mapsTo?: { type: 'role' | 'system'; id: string }; }
export interface PolicyConstraint { leftOperand: string; operator: string; rightOperand: { '@value': string | boolean; '@type': string }; quote: string; }
export interface PolicyRule {
  id: string; provisionId: string; kind: RuleKind; assignee: string; action: string; target: string;
  constraints: PolicyConstraint[];
  source: { quote: string; assigneeQuote: string; actionQuote: string; targetQuote: string };
}
export interface PolicyGraph { documents: PolicyDocument[]; provisions: Provision[]; definitions: Definition[]; rules: PolicyRule[]; }
export interface RuleAlignment { ruleId: string; roleId: string; systemIds: string[]; controlIds: string[]; state: 'confirmed' | 'suggested' | 'unmatched'; }
export interface RuleImpact {
  ruleId: string; status: Status; failing: 'alignment' | 'assignee' | 'target' | 'control' | null;
  reason: string; affected: boolean;
  evaluation: 'not-evaluated'; evaluationReason: string;
}
