export type Status = 'covered' | 'at-risk' | 'unowned' | 'proposed' | 'verified' | 'unknown' | 'inactive';
export type EntityType = 'person' | 'role' | 'system' | 'control' | 'requirement';
export type Category = 'governance' | 'risk' | 'compliance';
export interface Person { id: string; name: string; title: string; department: string; active: boolean; skills: string[]; }
export interface Role { id: string; name: string; description: string; ownerId: string | null; deputyIds: string[]; eligiblePersonIds: string[]; accountableRoleId: string | null; }
export interface System { id: string; name: string; description: string; roleId: string; }
export interface Control { id: string; name: string; description: string; category: Category; roleId: string; systemIds: string[]; requirementIds: string[]; evidence: { status: 'current' | 'missing' | 'stale'; reference: string; checkedAt: string }; }
export interface Requirement { id: string; name: string; description: string; source: 'Internal policy' | 'Customer commitment'; reference: string; }
export interface Office { id: string; name: string; description: string; people: Person[]; roles: Role[]; systems: System[]; controls: Control[]; requirements: Requirement[]; }
export interface Scenario { id: string; kind: 'baseline' | 'leave' | 'join' | 'move'; personId?: string; targetRoleId?: string; newPerson?: Person; createdAt: string; }
export interface Repair { id: string; roleId: string; candidateId: string; status: 'proposed' | 'confirmed'; authorisedById: string; ownerAccepted: boolean; authorityConfirmed: boolean; accessConfirmed: boolean; evidence: string; createdAt: string; }
export interface Plan { schemaVersion: 1; scenario: Scenario; repairs: Repair[]; }
export interface GraphNode { id: string; type: EntityType; label: string; subtitle: string; description: string; status: Status; affected: boolean; reason: string; entityId: string; }
export interface GraphEdge { id: string; source: string; target: string; label: string; affected: boolean; }
export interface Candidate { personId: string; name: string; kind: 'authorised-deputy' | 'eligible' | 'new-starter'; reason: string; requiresAuthorisation: boolean; }
export interface RoleImpact { roleId: string; name: string; status: Status; baselineOwnerId: string | null; ownerId: string | null; accountablePersonId: string | null; reason: string; candidates: Candidate[]; repair?: Repair; }
export interface Finding { id: string; category: Category; title: string; description: string; status: Status; roleId: string; controlId?: string; requirementIds: string[]; nodeIds: string[]; accountablePersonId: string | null; action: string; evidenceNeeded: string; }
export interface RequirementImpact { requirementId: string; name: string; status: Status; controlIds: string[]; reason: string; }
export interface Snapshot { office: Office; plan: Plan; people: Person[]; nodes: GraphNode[]; edges: GraphEdge[]; roles: RoleImpact[]; findings: Finding[]; requirements: RequirementImpact[]; affectedNodeIds: string[]; summary: { affected: number; unowned: number; proposed: number; verified: number; requirementsAtRisk: number }; scenarioLabel: string; }
export interface QuestionAnswer { title: string; text: string; bullets: string[]; nodeIds: string[]; suggestedScenario?: Scenario; }
