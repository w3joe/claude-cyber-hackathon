import { ruleLabel, ruleSourceLabel } from './odrl';
import { rulesForProvision } from './policy-graph';
import type { GraphNode, Person, QuestionAnswer, RoleImpact, Scenario, Snapshot, Status } from './types';
import { evaluateOffice } from './engine';

const normalise = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const containsPhrase = (text: string, phrase: string) => (` ${text} `).includes(` ${normalise(phrase)} `);
const unique = (values: string[]) => [...new Set(values)];
const statuses: Record<Status, string> = { covered: 'recorded coverage', 'at-risk': 'at risk', unowned: 'no confirmed owner', proposed: 'handover pending', verified: 'verified in this plan', unknown: 'evidence needs review', inactive: 'inactive' };
const open = (status: Status) => ['at-risk', 'unowned', 'proposed', 'unknown'].includes(status);
const activeRoles = (snapshot: Snapshot) => snapshot.roles.filter(role => open(role.status));
const personName = (snapshot: Snapshot, id: string | null) => snapshot.people.find(person => person.id === id)?.name ?? 'No accountable person recorded';

function fallback(title = 'Ask about this office'): QuestionAnswer {
  return { title, text: 'This local question panel uses the recorded office map and a small set of supported questions. It does not use an AI model or infer facts about your organisation.', bullets: ['What happens if the head of media leaves?', 'Who can take over?', 'What is still unowned?', 'Which requirements are affected?', 'What evidence is missing?'], nodeIds: [] };
}

function peopleMentioned(text: string, snapshot: Snapshot): Person[] {
  const fullNames = snapshot.people.filter(person => containsPhrase(text, person.name));
  if (fullNames.length) return fullNames;
  const namedRoles = snapshot.office.roles.filter(role => containsPhrase(text, role.name));
  if (namedRoles.length) return unique(namedRoles.map(role => snapshot.roles.find(item => item.roleId === role.id)?.ownerId ?? role.ownerId).filter((id): id is string => Boolean(id))).flatMap(id => snapshot.people.filter(person => person.id === id));
  const roleAliases = snapshot.office.roles.filter(role => {
    const roleText = normalise(role.name);
    if (/\b(media manager|media head)\b/.test(text) && /\bmedia\b/.test(roleText)) return true;
    if (/\bdirector\b/.test(text) && /\bdirector\b/.test(roleText)) return true;
    if (/\bhr\b/.test(text) && /\b(hr|people)\b/.test(roleText)) return true;
    return false;
  });
  if (roleAliases.length) return unique(roleAliases.map(role => snapshot.roles.find(item => item.roleId === role.id)?.ownerId ?? role.ownerId).filter((id): id is string => Boolean(id))).flatMap(id => snapshot.people.filter(person => person.id === id));
  const firstNames = snapshot.people.filter(person => {
    const first = normalise(person.name).split(' ')[0];
    return first.length > 2 && containsPhrase(text, first);
  });
  return firstNames;
}

function mentionedRoles(text: string, snapshot: Snapshot): RoleImpact[] {
  const exact = snapshot.roles.filter(role => containsPhrase(text, role.name));
  if (exact.length) return exact;
  const people = peopleMentioned(text, snapshot);
  if (people.length) return snapshot.roles.filter(role => people.some(person => person.id === role.ownerId || person.id === role.baselineOwnerId));
  if (/\bmedia\b/.test(text)) return snapshot.roles.filter(role => /\bmedia\b/.test(normalise(role.name)));
  if (/\bdirector\b/.test(text)) return snapshot.roles.filter(role => /\bdirector\b/.test(normalise(role.name)));
  return [];
}

function resolveNode(text: string, snapshot: Snapshot): GraphNode[] {
  const matches = snapshot.nodes.filter(node => containsPhrase(text, node.label));
  if (matches.length) return matches;
  const roles = mentionedRoles(text, snapshot);
  return snapshot.nodes.filter(node => node.type === 'role' && roles.some(role => role.roleId === node.entityId));
}

function departureAnswer(text: string, snapshot: Snapshot): QuestionAnswer {
  const people = peopleMentioned(text, snapshot);
  if (people.length !== 1) return { title: people.length ? 'Choose one person for the scenario' : 'Which person would leave?', text: people.length ? 'More than one recorded person matches. Use one full name or an exact role title so the scenario has a clear subject.' : 'I could not identify one recorded role-holder. No scenario has been changed.', bullets: (people.length ? people : snapshot.people.filter(person => person.active)).map(person => `${person.name} — ${person.title}`), nodeIds: people.map(person => `p:${person.id}`) };
  const person = people[0];
  if (!person.active) return { title: `${person.name} is already inactive`, text: 'This person is already unavailable in the current scenario. Review the existing impact and proposed handovers instead of applying a second departure.', bullets: snapshot.roles.filter(role => role.baselineOwnerId === person.id).map(role => `${role.name}: ${role.reason}`), nodeIds: unique([`p:${person.id}`, ...snapshot.roles.filter(role => role.baselineOwnerId === person.id).map(role => `r:${role.roleId}`)]) };
  if (!snapshot.office.people.some(recorded => recorded.id === person.id)) return { title: 'This person belongs to the joining scenario', text: 'This new starter is not in the office baseline. Review or replace the joining scenario rather than creating a baseline departure for someone who is not recorded there.', bullets: [], nodeIds: [`p:${person.id}`] };
  const scenario: Scenario = { id: `question-leave-${person.id}`, kind: 'leave', personId: person.id, createdAt: new Date().toISOString() };
  const preview = evaluateOffice(snapshot.office, { schemaVersion: 1, scenario, repairs: [] });
  const lostRoles = preview.roles.filter(role => role.baselineOwnerId === person.id);
  const roleIds = new Set(lostRoles.map(role => role.roleId));
  const affectedControls = snapshot.office.controls.filter(control => roleIds.has(control.roleId));
  const requirementIds = unique(affectedControls.flatMap(control => control.requirementIds));
  return {
    title: `If ${person.name} leaves`,
    text: `${lostRoles.length ? `${lostRoles.length} recorded ${lostRoles.length === 1 ? 'responsibility would need' : 'responsibilities would need'} a confirmed owner` : 'No currently recorded responsibility is owned by this person'}. This is a separate preview based on the office baseline; applying it replaces the current scenario and its repair plan. Nothing has changed yet.`,
    bullets: [
      ...lostRoles.map(role => `${role.name}: ${role.reason} Accountable: ${personName(preview, role.accountablePersonId)}.`),
      ...(affectedControls.length ? [`Dependent controls: ${affectedControls.map(control => control.name).join('; ')}.`] : []),
      ...(requirementIds.length ? [`Requirements to review: ${preview.requirements.filter(requirement => requirementIds.includes(requirement.requirementId)).map(requirement => requirement.name).join('; ')}.`] : []),
      'A departure creates a dependency to review; it does not by itself establish a regulatory breach.',
    ],
    nodeIds: unique([`p:${person.id}`, ...lostRoles.map(role => `r:${role.roleId}`), ...affectedControls.map(control => `c:${control.id}`), ...requirementIds.map(id => `q:${id}`)]),
    suggestedScenario: scenario,
  };
}

/** Answers are deterministic views of the recorded map, never authorisation decisions. */
export function answerQuestion(question: string, snapshot: Snapshot): QuestionAnswer {
  const text = normalise(question).slice(0, 4000);
  if (!text) return fallback();
  if (/\b(leave|leaves|leaving|departure|depart|departs|resign|resigns|fire|fired|terminate|terminated)\b/.test(text)) return departureAnswer(text, snapshot);

  if (/\b(clause|clauses|obligation|obligations|rule|rules|odrl|prohibition|permission)\b/.test(text)) {
    const impacts = snapshot.rules.filter(rule => !['covered', 'verified'].includes(rule.status));
    const selected = impacts.length ? impacts : snapshot.rules;
    return { title: 'Policy rule coverage', text: 'ODRL rules distinguish must, may and must not. These answers assess control coverage; conditions and action performance are not evaluated.', bullets: selected.map(impact => {
      const rule = snapshot.office.policyGraph.rules.find(rule => rule.id === impact.ruleId)!;
      return `${ruleSourceLabel(snapshot.office.policyGraph, rule)} · ${ruleLabel[rule.kind]}: “${rule.source.quote}” ${impact.reason} ${impact.evaluationReason}`;
    }), nodeIds: unique(snapshot.office.requirements.filter(requirement => rulesForProvision(snapshot.office.policyGraph, requirement.provisionId).some(rule => selected.some(impact => impact.ruleId === rule.id))).map(requirement => `q:${requirement.id}`)) };
  }

  if (/\b(take over|replace|replacement|deputy|deputies|handover|successor|next in charge|self heal|self healing)\b/.test(text)) {
    const specified = mentionedRoles(text, snapshot);
    const roles = specified.length ? specified : activeRoles(snapshot);
    return {
      title: roles.length ? 'Available handover routes' : 'No open ownership handover',
      text: 'A recorded deputy is distinct from an eligible candidate. A suggested name does not transfer authority or close a gap; the handover must be confirmed against the recorded checks.',
      bullets: roles.length ? roles.flatMap(role => role.candidates.length ? role.candidates.map(candidate => `${role.name} → ${candidate.name}: ${candidate.kind === 'authorised-deputy' ? 'recorded authorised deputy' : candidate.kind === 'new-starter' ? 'new starter; onboarding and authorisation required' : 'eligible candidate; authorisation required'}. ${candidate.reason} Accountable: ${personName(snapshot, role.accountablePersonId)}.`) : [`${role.name}: no eligible active candidate is recorded. Escalate to ${personName(snapshot, role.accountablePersonId)}.`]) : ['The current map has no open role handover. Select a role to review its recorded deputies, or preview a departure.'],
      nodeIds: unique(roles.flatMap(role => [`r:${role.roleId}`, ...role.candidates.map(candidate => `p:${candidate.personId}`)])),
    };
  }

  if (/\b(unowned|vacant|missing owner|without an owner|no owner|unresolved|still open|open gaps)\b/.test(text)) {
    const roles = snapshot.roles.filter(role => !role.ownerId || role.status === 'unowned' || role.status === 'proposed');
    return { title: `${roles.length} ${roles.length === 1 ? 'role needs' : 'roles need'} attention`, text: 'Proposed handovers remain open until the required confirmation and evidence have been recorded.', bullets: roles.length ? roles.map(role => `${role.name}: ${statuses[role.status]}. ${role.reason} Accountable: ${personName(snapshot, role.accountablePersonId)}.`) : ['Every recorded role has a confirmed owner in this plan. Evidence gaps can still remain.'], nodeIds: roles.map(role => `r:${role.roleId}`) };
  }

  if (/\b(evidence|proof|verified|verify|audit trail|stale)\b/.test(text)) {
    const controls = snapshot.office.controls.filter(control => control.evidence.status !== 'current');
    const pending = snapshot.roles.filter(role => role.status === 'proposed' || role.status === 'unowned');
    return { title: 'Evidence and confirmation still needed', text: 'The map records evidence references and user confirmations. It does not inspect connected systems or independently certify those assertions.', bullets: [
      ...controls.map(control => `${control.name}: ${control.evidence.status} evidence. Recorded reference: ${control.evidence.reference || 'none'}. Last checked: ${control.evidence.checkedAt || 'not recorded'}.`),
      ...pending.map(role => `${role.name}: record valid authority, owner acceptance, access/readiness checks and a handover evidence reference.`),
      ...(!controls.length && !pending.length ? ['No missing or stale evidence is recorded in the current model. This is not proof that the real organisation meets every applicable requirement.'] : []),
    ], nodeIds: unique([...controls.map(control => `c:${control.id}`), ...pending.map(role => `r:${role.roleId}`)]) };
  }

  if (/\b(compliance|compliant|requirement|requirements|obligation|obligations)\b/.test(text)) {
    const requirements = snapshot.requirements.filter(requirement => open(requirement.status));
    return { title: `${requirements.length} ${requirements.length === 1 ? 'requirement needs' : 'requirements need'} review`, text: 'These are the internal policies and customer commitments recorded in this fictional office. A flagged dependency is a review finding, not an automatic legal or regulatory conclusion.', bullets: requirements.length ? requirements.map(requirement => `${requirement.name}: ${statuses[requirement.status]}. ${requirement.reason}`) : ['All recorded requirements have coverage in this plan. Applicability, completeness and real-world effectiveness remain outside this local model.'], nodeIds: unique(requirements.flatMap(requirement => [`q:${requirement.requirementId}`, ...requirement.controlIds.map(id => `c:${id}`)])) };
  }

  if (/\b(accountable|accountability|in charge|escalate|escalation|responsible|authority|governance)\b/.test(text)) {
    const specified = mentionedRoles(text, snapshot);
    const roles = specified.length ? specified : activeRoles(snapshot);
    return { title: 'Who is accountable', text: 'Accountability follows the configured role chain. A senior title alone does not create authority, and no replacement is assigned automatically.', bullets: (roles.length ? roles : snapshot.roles).map(role => `${role.name}: ${personName(snapshot, role.accountablePersonId)}. ${role.reason}`), nodeIds: unique((roles.length ? roles : snapshot.roles).flatMap(role => [`r:${role.roleId}`, ...(role.accountablePersonId ? [`p:${role.accountablePersonId}`] : [])])) };
  }

  if (/\b(why|explain|impact|affected|risk|risks|what changed)\b/.test(text)) {
    const nodes = resolveNode(text, snapshot);
    if (nodes.length) return { title: nodes.length === 1 ? nodes[0].label : 'Recorded dependencies', text: 'This explanation follows the links recorded in the current office map.', bullets: nodes.map(node => `${node.label}: ${statuses[node.status]}. ${node.reason}`), nodeIds: unique(nodes.flatMap(node => [node.id, ...snapshot.edges.filter(edge => edge.source === node.id || edge.target === node.id).flatMap(edge => [edge.source, edge.target])])) };
    if (/^why\b/.test(text)) return fallback('That item is not identified in the office map');
    const findings = snapshot.findings.filter(finding => open(finding.status));
    return { title: 'Current scenario impact', text: `${snapshot.scenarioLabel}. ${snapshot.summary.affected} map items are affected by the selected scenario.`, bullets: findings.length ? findings.map(finding => `${finding.title}: ${finding.description} Next action: ${finding.action}`) : ['No open finding is recorded for this scenario. The model only covers the relationships and requirements supplied.'], nodeIds: unique(findings.flatMap(finding => finding.nodeIds)) };
  }

  if (/\b(join|joins|joining|move|moves|moving|new starter|change role)\b/.test(text)) return { title: 'Set up this people change', text: 'Use the scenario controls to choose the person and target role, or enter a new starter. Those details are required before the impact can be calculated.', bullets: ['Joining creates a candidate and onboarding work; it does not silently confirm ownership.', 'Moving roles can leave old responsibilities uncovered.', 'Every proposed transfer remains pending until the checks and evidence are recorded.'], nodeIds: [] };
  return fallback('That question is outside the local question set');
}
