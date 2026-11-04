import { entityIri, exportPolicies, ruleLabel, ruleSourceLabel } from './odrl';
import type { Control, Office, PolicyGraph, RoleImpact, RuleImpact, Status } from './types';

export function combineStatus(statuses: Status[]): Status {
  if (!statuses.length) return 'unknown';
  if (statuses.includes('unowned') || statuses.includes('at-risk')) return 'at-risk';
  if (statuses.includes('proposed')) return 'proposed';
  if (statuses.includes('unknown')) return 'unknown';
  if (statuses.includes('verified')) return 'verified';
  return 'covered';
}
export const hasCoverage = (status: Status) => status === 'covered' || status === 'verified';

/** Descendants plus explicit references, never implicit policy inheritance. */
export function rulesForProvision(graph: PolicyGraph, provisionId: string) {
  const seen = new Set<string>(); const pending = [provisionId];
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...(graph.provisions.find(p => p.id === id)?.refersTo ?? []), ...graph.provisions.filter(p => p.parentId === id).map(p => p.id));
  }
  return graph.rules.filter(rule => seen.has(rule.provisionId));
}

export function deriveControlLinks(office: Office): Control[] {
  return office.controls.map(control => ({ ...control, requirementIds: office.requirements.filter(requirement =>
    rulesForProvision(office.policyGraph, requirement.provisionId).some(rule => office.ruleAlignments.some(a => a.ruleId === rule.id && a.state === 'confirmed' && a.controlIds.includes(control.id))))
    .map(requirement => requirement.id) }));
}

type Dependency = { status: Status; affected: boolean; reason: string };
export function assessRules(office: Office, roles: RoleImpact[], systems: Map<string, Dependency>, controls: Map<string, Dependency>, affectedRoles: Set<string>): RuleImpact[] {
  let expressionError = '';
  try { exportPolicies(office.policyGraph); } catch (error) { expressionError = error instanceof Error ? error.message : 'Invalid policy expression.'; }
  const documentId = (rule: Office['policyGraph']['rules'][number]) => office.policyGraph.provisions.find(p => p.id === rule.provisionId)?.documentId;
  const invalidDocuments = new Set(office.policyGraph.rules.filter(rule => rule.kind === 'permission' && office.policyGraph.rules.some(other =>
    other.kind === 'prohibition' && documentId(other) === documentId(rule) && other.assignee === rule.assignee && other.action === rule.action && other.target === rule.target)).map(documentId));
  return office.policyGraph.rules.map(rule => {
    const alignment = office.ruleAlignments.find(a => a.ruleId === rule.id);
    const role = roles.find(r => r.roleId === alignment?.roleId);
    const affected = Boolean(alignment && (affectedRoles.has(alignment.roleId) || alignment.systemIds.some(id => systems.get(id)?.affected) || alignment.controlIds.some(id => controls.get(id)?.affected)));
    const evaluationReason = rule.kind === 'permission' ? 'Permission is expressed, not granted by this coverage check. Exercise is optional; conditions and any required duties need evaluation.'
      : rule.kind === 'prohibition' ? 'Infringement is not evaluated: control coverage does not establish that the forbidden action did not occur.'
      : 'Fulfilment is not evaluated: action performance and any timing conditions require evidence beyond control coverage.';
    const base = { ruleId: rule.id, affected, evaluation: 'not-evaluated' as const, evaluationReason };
    if (expressionError) return { ...base, status: 'unknown', failing: 'alignment', reason: `Policy expression cannot be assessed: ${expressionError}` };
    if (invalidDocuments.has(documentId(rule))) return { ...base, status: 'unknown', failing: 'alignment', reason: 'Potential permission/prohibition conflict: entire policy assessment is invalid pending review.' };
    if (!alignment || alignment.state !== 'confirmed' || !alignment.controlIds.length) return { ...base, status: 'unknown', failing: 'alignment', reason: 'Rule not mapped to a confirmed control; coverage is unknown.' };
    const subjectMatches = Boolean(role && rule.assignee === entityIri('role', alignment.roleId));
    const targetMatches = alignment.systemIds.some(id => entityIri('system', id) === rule.target);
    const subjectStatus: Status = subjectMatches ? role!.status : 'unknown';
    const targetStatus = targetMatches ? combineStatus(alignment.systemIds.map(id => systems.get(id)?.status ?? 'unknown')) : 'unknown';
    // Every mapped control is required. Alternatives must be represented explicitly in a future profile.
    const controlStatus = combineStatus(alignment.controlIds.map(id => controls.get(id)?.status ?? 'unknown'));
    const parts = [
      { name: 'assignee' as const, status: subjectStatus, reason: subjectMatches ? role!.reason : 'Assignee does not match an existing office role.' },
      { name: 'target' as const, status: targetStatus, reason: targetMatches ? alignment.systemIds.map(id => systems.get(id)?.reason ?? `Missing target system ${id}.`).join(' ') : 'Target does not match the aligned office systems.' },
      { name: 'control' as const, status: controlStatus, reason: alignment.controlIds.map(id => controls.get(id)?.reason ?? `Missing control ${id}.`).join(' ') },
    ];
    const first = parts.find(part => !hasCoverage(part.status));
    return { ...base, status: combineStatus(parts.map(part => part.status)), failing: first?.name ?? null,
      reason: `${ruleSourceLabel(office.policyGraph, rule)} · ${ruleLabel[rule.kind]}: ${first ? `${first.name}: ${first.reason}` : 'Confirmed assignee, target and control coverage.'}` };
  });
}
