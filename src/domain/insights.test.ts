import { describe, expect, it } from 'vitest';
import { createBaselinePlan, evaluateOffice } from './engine';
import { impactDistances, keyPersonRisks, resilienceScore } from './insights';
import { seedOffice } from './seed';

describe('insights', () => {
  it('scores the baseline higher than a departure', () => {
    const baseline = resilienceScore(evaluateOffice(seedOffice, createBaselinePlan())).score;
    const departure = resilienceScore(evaluateOffice(seedOffice, { schemaVersion: 1, scenario: { id: 'x', kind: 'leave', personId: 'maya', createdAt: '' }, repairs: [] })).score;
    expect(baseline).toBeGreaterThan(departure);
    expect(baseline).toBeLessThanOrEqual(100);
  });

  it('ranks every active person and flags roles without a deputy', () => {
    const risks = keyPersonRisks(seedOffice);
    expect(risks).toHaveLength(seedOffice.people.length);
    expect(risks[0].drop).toBeGreaterThanOrEqual(risks.at(-1)!.drop);
    expect(risks.find(r => r.personId === 'theo')?.singlePointOfFailure).toBe(true);
    expect(risks.find(r => r.personId === 'maya')?.singlePointOfFailure).toBe(false);
  });

  it('measures hop distance from the departing person', () => {
    const snapshot = evaluateOffice(seedOffice, { schemaVersion: 1, scenario: { id: 'x', kind: 'leave', personId: 'maya', createdAt: '' }, repairs: [] });
    const distances = impactDistances(snapshot);
    expect(distances.get('p:maya')).toBe(0);
    expect(distances.get('r:head-media')).toBe(1);
    expect(impactDistances(evaluateOffice(seedOffice, createBaselinePlan())).size).toBe(0);
  });
});
