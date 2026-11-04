import type { Candidate, Control, Finding, GraphEdge, GraphNode, Office, Person, Plan, Repair, RequirementImpact, Role, RoleImpact, Snapshot, Status } from './types';

export function createBaselinePlan(): Plan {
  return { schemaVersion: 1, scenario: { id: 'baseline', kind: 'baseline', createdAt: '2026-11-04T09:00:00.000Z' }, repairs: [] };
}

const personName = (people: Person[], id: string | null | undefined) => people.find(person => person.id === id)?.name ?? 'No one';
const activePerson = (people: Person[], id: string | null | undefined) => people.find(person => person.id === id && person.active);
const canOwn = (role: Role, person: Person) => person.active && (role.ownerId === person.id || role.deputyIds.includes(person.id) || role.eligiblePersonIds.includes(person.id) || person.skills.includes(role.id));

function accountabilityChain(office: Office, roles: RoleImpact[], people: Person[], roleId: string): Person[] {
  const result: Person[] = [];
  const seen = new Set<string>([roleId]);
  let next = office.roles.find(role => role.id === roleId)?.accountableRoleId;
  while (next && !seen.has(next)) {
    seen.add(next);
    const owner = activePerson(people, roles.find(role => role.roleId === next)?.ownerId);
    if (owner && !result.some(person => person.id === owner.id)) result.push(owner);
    next = office.roles.find(role => role.id === next)?.accountableRoleId;
  }
  return result;
}

export function getEligibleApprovers(snapshot: Snapshot, roleId: string): Person[] {
  return accountabilityChain(snapshot.office, snapshot.roles, snapshot.people, roleId);
}

export function validateRepair(snapshot: Snapshot, repair: Repair): string[] {
  const errors: string[] = [];
  const role = snapshot.office.roles.find(item => item.id === repair.roleId);
  const candidate = snapshot.people.find(person => person.id === repair.candidateId);
  if (!role) errors.push('The selected role does not exist.');
  if (!candidate || !candidate.active) errors.push('The proposed owner must be an active person in this scenario.');
  else if (role && !canOwn(role, candidate)) errors.push('The proposed owner is not a recorded deputy, eligible candidate or person with the recorded role competency.');
  if (repair.status !== 'proposed' && repair.status !== 'confirmed') errors.push('The handover status is invalid.');
  if (repair.status === 'confirmed') {
    if (!getEligibleApprovers(snapshot, repair.roleId).some(person => person.id === repair.authorisedById)) errors.push('An active owner in the configured accountability chain must authorise the handover.');
    if (repair.authorisedById === repair.candidateId) errors.push('The proposed owner cannot authorise their own handover.');
    if (repair.ownerAccepted !== true) errors.push('The new owner must explicitly accept the responsibility.');
    if (repair.authorityConfirmed !== true) errors.push('The required decision-making authority must be confirmed.');
    if (repair.accessConfirmed !== true) errors.push('The required system access must be checked and confirmed.');
    const reference = typeof repair.evidence === 'string' ? repair.evidence.trim() : '';
    if (reference.length < 12 || new Set(reference.toLowerCase()).size < 5 || /^(done|yes|confirmed|approved|n\/a|none|test|placeholder)[.!\s]*$/i.test(reference)) errors.push('Add a meaningful evidence reference of at least 12 characters for the recorded handover checks.');
  }
  return errors;
}

function candidatesFor(office: Office, people: Person[], role: Role, plan: Plan): Candidate[] {
  return people.filter(person => canOwn(role, person)).map(person => {
    const isStarter = plan.scenario.kind === 'join' && plan.scenario.newPerson?.id === person.id;
    const deputy = role.deputyIds.includes(person.id);
    return {
      personId: person.id, name: person.name,
      kind: isStarter ? 'new-starter' : deputy ? 'authorised-deputy' : 'eligible',
      reason: isStarter ? 'New starter with the recorded role competency; onboarding and handover checks are still required.' : deputy ? 'Recorded deputy for this role; handover, authority and access still need confirmation.' : role.ownerId === person.id ? 'Original role owner; available only while active in this scenario.' : 'Recorded as eligible or holding the role competency; no authority is granted by seniority alone.',
      requiresAuthorisation: true,
    };
  });
}

function accountabilityReason(office: Office, roles: RoleImpact[], people: Person[], role: Role): string {
  if (!role.accountableRoleId) return 'This is the configured final accountability point.';
  const chain = accountabilityChain(office, roles, people, role.id);
  if (!chain.length) return 'No active owner is available in the configured accountability chain; a governance decision is required.';
  const directRole = roles.find(item => item.roleId === role.accountableRoleId);
  return activePerson(people, directRole?.ownerId) ? `Accountable to ${chain[0].name}.` : `Accountability escalates to ${chain[0].name} because the immediate accountable role has no active owner.`;
}

function combineStatus(statuses: Status[]): Status {
  if (!statuses.length) return 'unknown';
  if (statuses.includes('unowned') || statuses.includes('at-risk')) return 'at-risk';
  if (statuses.includes('proposed')) return 'proposed';
  if (statuses.includes('unknown')) return 'unknown';
  if (statuses.includes('verified')) return 'verified';
  return 'covered';
}

export function evaluateOffice(office: Office, plan: Plan): Snapshot {
  const people: Person[] = office.people.map(person => ({ ...person, skills: [...person.skills] }));
  const scenario = plan.scenario;
  const departing = scenario.kind === 'leave' ? people.find(person => person.id === scenario.personId) : undefined;
  if (departing) departing.active = false;
  if (scenario.kind === 'join' && scenario.newPerson && !people.some(person => person.id === scenario.newPerson?.id)) people.push({ ...scenario.newPerson, skills: [...scenario.newPerson.skills] });
  const moving = scenario.kind === 'move' ? activePerson(people, scenario.personId) : undefined;
  const isScenarioTarget = (roleId: string) => (scenario.kind === 'move' || scenario.kind === 'join') && scenario.targetRoleId === roleId;
  const roles: RoleImpact[] = office.roles.map(role => {
    const vacated = role.ownerId === departing?.id || role.ownerId === moving?.id;
    const ownerId = vacated ? null : activePerson(people, role.ownerId)?.id ?? null;
    const pending = isScenarioTarget(role.id);
    const status: Status = pending && !ownerId ? 'proposed' : ownerId ? 'covered' : 'unowned';
    let reason = ownerId ? `${personName(people, ownerId)} remains the recorded owner.` : role.ownerId ? `${personName(office.people, role.ownerId)} ${moving ? 'is moving and has vacated' : 'has left and no longer owns'} this role. Ownership has not transferred automatically.` : 'This planned role has no recorded owner.';
    if (pending) reason += ` ${scenario.kind === 'join' ? scenario.newPerson?.name ?? 'A new starter' : personName(people, moving?.id)} is proposed for consideration; appointment, onboarding and handover are not yet confirmed.`;
    return { roleId: role.id, name: role.name, status, baselineOwnerId: role.ownerId, ownerId, accountablePersonId: null, reason, candidates: candidatesFor(office, people, role, plan) };
  });
  const snapshot: Snapshot = { office, plan, people, roles, nodes: [], edges: [], findings: [], requirements: [], affectedNodeIds: [], summary: { affected: 0, unowned: 0, proposed: 0, verified: 0, requirementsAtRisk: 0 }, scenarioLabel: 'Baseline office' };
  const repairErrors = new Map<string, string[]>();
  // Only the most recently supplied decision for a role applies. An invalid confirmation never appoints anyone.
  const latestRepairs = [...new Map(plan.repairs.map(repair => [repair.roleId, repair])).values()];
  for (const repair of latestRepairs) {
    const impact = roles.find(role => role.roleId === repair.roleId);
    if (!impact) continue;
    impact.repair = { ...repair };
    const errors = validateRepair(snapshot, repair);
    repairErrors.set(repair.roleId, errors);
    if (!errors.length && repair.status === 'confirmed') {
      impact.ownerId = repair.candidateId;
      impact.status = 'verified';
      impact.reason = `Handover to ${personName(people, repair.candidateId)} is recorded as verified: acceptance, authority and access were confirmed by ${personName(people, repair.authorisedById)}. Evidence: ${repair.evidence.trim()}. This does not refresh control evidence.`;
    } else if (!errors.length) {
      impact.status = 'proposed';
      impact.reason = `${personName(people, repair.candidateId)} is proposed. ${impact.ownerId ? `${personName(people, impact.ownerId)} remains the recorded owner.` : 'Ownership remains unfilled.'} Authorisation, acceptance, authority, access and handover evidence must be confirmed.`;
    } else {
      impact.reason += ` Handover was not applied: ${errors.join(' ')}`;
    }
  }
  for (const role of office.roles) {
    const impact = roles.find(item => item.roleId === role.id)!;
    const chain = accountabilityChain(office, roles, people, role.id);
    impact.accountablePersonId = chain[0]?.id ?? (!role.accountableRoleId ? impact.ownerId : null);
    impact.reason += ` ${accountabilityReason(office, roles, people, role)}`;
    if (impact.ownerId && role.accountableRoleId && !chain.length && impact.status !== 'proposed') impact.status = 'at-risk';
  }
  const baselineRoles: RoleImpact[] = office.roles.map(role => ({ roleId: role.id, name: role.name, ownerId: activePerson(office.people, role.ownerId)?.id ?? null, baselineOwnerId: role.ownerId, accountablePersonId: null, status: role.ownerId ? 'covered' : 'unowned', reason: '', candidates: [] }));
  const roleAffected = new Set(roles.filter(impact => {
    const role = office.roles.find(item => item.id === impact.roleId)!;
    const originalAccountable = accountabilityChain(office, baselineRoles, office.people, role.id)[0]?.id ?? (!role.accountableRoleId ? role.ownerId : null);
    return impact.ownerId !== role.ownerId || impact.accountablePersonId !== originalAccountable || isScenarioTarget(role.id) || Boolean(impact.repair);
  }).map(role => role.roleId));
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const pushEdge = (source: string, target: string, label: string) => edges.push({ id: `${source}>${target}:${label}`, source, target, label, affected: false });
  for (const person of people) {
    const isStarter = scenario.kind === 'join' && person.id === scenario.newPerson?.id;
    const confirmedTarget = roles.find(role => role.roleId === scenario.targetRoleId && role.ownerId === person.id && role.status === 'verified');
    const reason = !person.active ? 'Inactive in this departure scenario. No role ownership or approval authority is retained.' : isStarter ? confirmedTarget ? `New starter with a recorded verified handover for ${confirmedTarget.name}. This does not grant authority for other roles.` : 'New starter is a candidate only. Each role requires an authorised and evidenced handover.' : person.id === moving?.id ? confirmedTarget ? `Previous responsibilities were vacated. Handover to ${confirmedTarget.name} is now recorded as verified.` : 'Previous responsibilities were vacated. The target appointment is only proposed until confirmed.' : 'Active person in the office model.';
    nodes.push({ id: `p:${person.id}`, type: 'person', entityId: person.id, label: person.name, subtitle: person.title, description: `${person.department} · ${person.skills.length ? 'Recorded competencies: ' + person.skills.join(', ') : 'No role competencies recorded'}`, status: !person.active ? 'inactive' : isStarter ? confirmedTarget ? 'verified' : 'proposed' : 'covered', affected: person.id === departing?.id || person.id === moving?.id || isStarter || roles.some(role => Boolean(role.repair) && role.ownerId === person.id), reason });
  }
  for (const impact of roles) {
    const role = office.roles.find(item => item.id === impact.roleId)!;
    nodes.push({ id: `r:${role.id}`, type: 'role', entityId: role.id, label: role.name, subtitle: impact.ownerId ? personName(people, impact.ownerId) : 'No confirmed owner', description: role.description, status: impact.status, affected: roleAffected.has(role.id), reason: impact.reason });
    if (impact.ownerId) pushEdge(`p:${impact.ownerId}`, `r:${role.id}`, impact.status === 'verified' ? 'handover recorded' : 'owns');
    else if (role.ownerId) pushEdge(`p:${role.ownerId}`, `r:${role.id}`, 'ownership removed');
    if (role.accountableRoleId) pushEdge(`r:${role.accountableRoleId}`, `r:${role.id}`, 'accountable for');
    if (impact.repair && impact.status === 'proposed') pushEdge(`p:${impact.repair.candidateId}`, `r:${role.id}`, 'proposed');
    else if (isScenarioTarget(role.id)) {
      const id = scenario.kind === 'join' ? scenario.newPerson?.id : scenario.personId;
      if (id && people.some(person => person.id === id)) pushEdge(`p:${id}`, `r:${role.id}`, 'proposed');
    }
  }
  const systemState = new Map<string, { status: Status; affected: boolean; reason: string }>();
  const coverageStatus = (role: RoleImpact | undefined): Status => !role ? 'unknown' : !role.ownerId ? role.status === 'proposed' ? 'proposed' : 'unowned' : role.status === 'at-risk' ? 'at-risk' : role.status === 'verified' ? 'verified' : 'covered';
  for (const system of office.systems) {
    const owner = roles.find(role => role.roleId === system.roleId);
    const status = coverageStatus(owner);
    const reason = owner ? `${system.name} depends on ${owner.name}. ${owner.ownerId ? `Recorded owner: ${personName(people, owner.ownerId)}.` : 'No confirmed system owner is available.'} ${owner.status === 'at-risk' ? 'Configured accountability has no active owner.' : ''}`.trim() : 'The configured owning role does not exist.';
    const affected = roleAffected.has(system.roleId);
    systemState.set(system.id, { status, affected, reason });
    nodes.push({ id: `s:${system.id}`, type: 'system', entityId: system.id, label: system.name, subtitle: owner?.name ?? 'Missing role', description: system.description, status, affected, reason });
    pushEdge(`r:${system.roleId}`, `s:${system.id}`, 'responsible for');
  }
  const controlState = new Map<string, { status: Status; affected: boolean; reason: string }>();
  for (const control of office.controls) {
    const owner = roles.find(role => role.roleId === control.roleId);
    const dependencyStates = control.systemIds.map(id => systemState.get(id));
    const statuses: Status[] = [coverageStatus(owner), ...dependencyStates.map(state => state?.status ?? 'unknown')];
    const concerns: string[] = [];
    if (!owner?.ownerId) concerns.push(`${owner?.name ?? 'Configured role'} has no confirmed owner${owner?.status === 'proposed' ? '; the handover is only proposed' : ''}.`);
    else if (owner.status === 'at-risk') concerns.push(`${owner.name} has no active owner in its configured accountability chain.`);
    for (const id of control.systemIds) {
      const system = office.systems.find(item => item.id === id);
      const state = systemState.get(id);
      if (!state || !['covered', 'verified'].includes(state.status)) concerns.push(state?.reason ?? `The required system ${system?.name ?? id} is missing.`);
    }
    const evidenceUsable = control.evidence.status === 'current' && control.evidence.reference.trim().length > 0 && Boolean(control.evidence.checkedAt);
    if (!evidenceUsable) { statuses.push('unknown'); concerns.push(`Control evidence is ${control.evidence.status === 'current' ? 'incomplete' : control.evidence.status}; current operation is unknown. Ownership repair cannot refresh it.`); }
    else concerns.push(`Existing control evidence is recorded as current: ${control.evidence.reference}.`);
    const aggregate = combineStatus(statuses);
    // Missing ownership is visible on the control itself, while dependent requirements show the resulting risk.
    const status: Status = !owner?.ownerId && owner?.status !== 'proposed' ? 'unowned' : aggregate;
    const affected = roleAffected.has(control.roleId) || dependencyStates.some(state => state?.affected);
    const reason = concerns.join(' ');
    controlState.set(control.id, { status, affected, reason });
    nodes.push({ id: `c:${control.id}`, type: 'control', entityId: control.id, label: control.name, subtitle: `${control.category} · ${owner?.name ?? 'Missing role'}`, description: control.description, status, affected, reason });
    pushEdge(`r:${control.roleId}`, `c:${control.id}`, 'owns control');
    for (const id of control.systemIds) pushEdge(`s:${id}`, `c:${control.id}`, 'supports');
    for (const id of control.requirementIds) pushEdge(`c:${control.id}`, `q:${id}`, 'supports requirement');
  }
  const requirements: RequirementImpact[] = office.requirements.map(requirement => {
    const controls = office.controls.filter(control => control.requirementIds.includes(requirement.id));
    const status = combineStatus(controls.map(control => controlState.get(control.id)?.status ?? 'unknown'));
    const affectedControls = controls.filter(control => !['covered', 'verified'].includes(controlState.get(control.id)?.status ?? 'unknown'));
    const reason = controls.length === 0 ? 'No supporting controls are modelled; coverage is unknown.' : affectedControls.length ? affectedControls.map(control => `${control.name}: ${controlState.get(control.id)?.reason}`).join(' ') : 'The modelled supporting controls have named owners and evidence recorded as current. This is scoped coverage, not a certification or a global compliance conclusion.';
    const impact = { requirementId: requirement.id, name: requirement.name, status, controlIds: controls.map(control => control.id), reason };
    nodes.push({ id: `q:${requirement.id}`, type: 'requirement', entityId: requirement.id, label: requirement.name, subtitle: `${requirement.source} · ${requirement.reference}`, description: requirement.description, status, affected: controls.some(control => controlState.get(control.id)?.affected), reason });
    return impact;
  });
  const findings: Finding[] = [];
  for (const impact of roles) if (!['covered', 'verified'].includes(impact.status)) findings.push({ id: `role-${impact.roleId}`, category: 'governance', title: `${impact.name}: ${impact.status === 'proposed' ? 'handover pending' : impact.status === 'unowned' ? 'owner needed' : 'accountability gap'}`, description: impact.reason, status: impact.status, roleId: impact.roleId, requirementIds: [], nodeIds: [`r:${impact.roleId}`], accountablePersonId: impact.accountablePersonId, action: repairErrors.get(impact.roleId)?.length ? `Correct the rejected handover: ${repairErrors.get(impact.roleId)!.join(' ')}` : 'Record an eligible candidate, obtain authorisation and complete the handover checks.', evidenceNeeded: 'Named authoriser; owner acceptance; decision authority; access check; meaningful handover evidence reference.' });
  for (const control of office.controls) {
    const state = controlState.get(control.id)!;
    if (['covered', 'verified'].includes(state.status)) continue;
    findings.push(controlFinding(control, state.status, state.reason, roles));
  }
  const affectedNodeIds = nodes.filter(node => node.affected).map(node => node.id);
  const affectedSet = new Set(affectedNodeIds);
  for (const edge of edges) edge.affected = affectedSet.has(edge.source) && affectedSet.has(edge.target);
  snapshot.nodes = nodes;
  snapshot.edges = edges;
  snapshot.findings = findings;
  snapshot.requirements = requirements;
  snapshot.affectedNodeIds = affectedNodeIds;
  snapshot.summary = { affected: affectedNodeIds.length, unowned: roles.filter(role => !role.ownerId).length, proposed: roles.filter(role => role.status === 'proposed').length, verified: roles.filter(role => role.status === 'verified').length, requirementsAtRisk: requirements.filter(requirement => ['at-risk', 'unowned', 'proposed'].includes(requirement.status)).length };
  snapshot.scenarioLabel = scenario.kind === 'leave' ? `${personName(office.people, scenario.personId)} leaves` : scenario.kind === 'move' ? `${personName(people, scenario.personId)} moves role` : scenario.kind === 'join' ? `${scenario.newPerson?.name ?? 'New starter'} joins` : 'Baseline office';
  return snapshot;
}

function controlFinding(control: Control, status: Status, reason: string, roles: RoleImpact[]): Finding {
  return { id: `control-${control.id}`, category: control.category, title: control.name, description: reason, status, roleId: control.roleId, controlId: control.id, requirementIds: [...control.requirementIds], nodeIds: [`r:${control.roleId}`, ...control.systemIds.map(id => `s:${id}`), `c:${control.id}`, ...control.requirementIds.map(id => `q:${id}`)], accountablePersonId: roles.find(role => role.roleId === control.roleId)?.accountablePersonId ?? null, action: status === 'unknown' ? 'Perform the control check and attach current evidence; changing the owner is insufficient.' : 'Resolve the named ownership or dependency gap, then check the control and its evidence.', evidenceNeeded: control.evidence.status === 'current' ? 'Authorised ownership handover and confirmed access to the supporting systems.' : `A fresh ${control.name.toLowerCase()} record; previous reference: ${control.evidence.reference || 'none'}.` };
}
