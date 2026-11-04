import { evaluateOffice } from './engine';
import type { Office, Snapshot, Status } from './types';

/** How much each status contributes to resilience (1 = fully healthy). */
const STATUS_WEIGHT: Record<Status, number> = {
  covered: 1, verified: 1, proposed: 0.5, 'at-risk': 0.35, unknown: 0.55, unowned: 0, inactive: 1,
};

export interface ResilienceScore { score: number; roles: number; controls: number; requirements: number }

const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 1;

/** A planning indicator, not a compliance rating: weighted health of roles, controls and requirements. */
export function resilienceScore(snapshot: Snapshot): ResilienceScore {
  const of = (type: 'role' | 'control' | 'requirement') =>
    average(snapshot.nodes.filter(node => node.type === type).map(node => STATUS_WEIGHT[node.status]));
  const roles = of('role');
  const controls = of('control');
  const requirements = of('requirement');
  const score = Math.round((roles * 0.4 + controls * 0.3 + requirements * 0.3) * 100);
  return { score, roles: Math.round(roles * 100), controls: Math.round(controls * 100), requirements: Math.round(requirements * 100) };
}

export interface KeyPersonRisk {
  personId: string; name: string; title: string;
  score: number; drop: number; affected: number; unownedRoles: number; requirementsAtRisk: number;
  /** A vacated role has no recorded deputy: nobody is pre-authorised to step in. */
  singlePointOfFailure: boolean; exposedRoles: string[];
}

/** Simulates every active person leaving and ranks them by how much resilience is lost. */
export function keyPersonRisks(office: Office): KeyPersonRisk[] {
  const baselineScore = resilienceScore(evaluateOffice(office, { schemaVersion: 1, scenario: { id: 'baseline', kind: 'baseline', createdAt: '' }, repairs: [] })).score;
  return office.people.filter(person => person.active).map(person => {
    const snapshot = evaluateOffice(office, { schemaVersion: 1, scenario: { id: `scan-${person.id}`, kind: 'leave', personId: person.id, createdAt: '' }, repairs: [] });
    const { score } = resilienceScore(snapshot);
    const vacated = snapshot.roles.filter(role => role.baselineOwnerId === person.id && !role.ownerId);
    return {
      personId: person.id, name: person.name, title: person.title, score, drop: baselineScore - score,
      affected: snapshot.summary.affected, unownedRoles: vacated.length, requirementsAtRisk: snapshot.summary.requirementsAtRisk,
      singlePointOfFailure: vacated.some(role => !role.candidates.some(candidate => candidate.kind === 'authorised-deputy')),
      exposedRoles: vacated.map(role => role.name),
    };
  }).sort((a, b) => b.drop - a.drop || b.affected - a.affected);
}

/** Hop distance from the scenario's origin, used to play the impact as a ripple. */
export function impactDistances(snapshot: Snapshot): Map<string, number> {
  const { scenario } = snapshot.plan;
  const origin = scenario.kind === 'leave' || scenario.kind === 'move' ? `p:${scenario.personId}`
    : scenario.kind === 'join' ? `p:${scenario.newPerson?.id}` : null;
  const distances = new Map<string, number>();
  if (!origin) return distances;
  const neighbours = new Map<string, string[]>();
  for (const edge of snapshot.edges) {
    neighbours.set(edge.source, [...(neighbours.get(edge.source) ?? []), edge.target]);
    neighbours.set(edge.target, [...(neighbours.get(edge.target) ?? []), edge.source]);
  }
  distances.set(origin, 0);
  const queue = [origin];
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of neighbours.get(id) ?? []) {
      if (distances.has(next)) continue;
      distances.set(next, distances.get(id)! + 1);
      queue.push(next);
    }
  }
  return distances;
}
