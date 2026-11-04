import { describe, expect, it } from 'vitest';
import { createBaselinePlan, evaluateOffice } from './engine';
import { seedOffice } from './seed';
import { makeArchifyMap, roleForNode, selectionForMap } from './archify-map';
import type { Plan } from './types';

const departure = (): Plan => ({ ...createBaselinePlan(), scenario: { id: 'departure', kind: 'leave', personId: 'maya', createdAt: '2026-11-04T09:00:00Z' } });

describe('Archify snapshot projection', () => {
  it('uses a highlighted responsibility when a question clears selection', () => {
    const snapshot = evaluateOffice(seedOffice, createBaselinePlan());
    const selected = selectionForMap(null, ['p:ava', 'r:managing-director', 'r:head-media']);
    expect(makeArchifyMap(snapshot, selected, 'all', 'all').roleId).toBe('managing-director');
    expect(selectionForMap('r:it-lead', ['r:head-media'])).toBe('r:it-lead');
  });
  it('follows a moving person to the proposed target responsibility', () => {
    const plan = createBaselinePlan();
    plan.scenario = { id: 'move', kind: 'move', personId: 'sam', targetRoleId: 'assurance-coordinator', createdAt: '2026-11-04T09:00:00Z' };
    const snapshot = evaluateOffice(seedOffice, plan);
    expect(roleForNode(snapshot, 'p:sam')).toBe('assurance-coordinator');
    const map = makeArchifyMap(snapshot, 'p:sam', 'all', 'all');
    expect(map.specification.components.find(item => map.nodeIds[item.id] === 'r:assurance-coordinator')?.tag).toContain('proposed');
  });
  it('changes ownership and state from the actual scenario rather than keeping a static diagram', () => {
    const baseline = makeArchifyMap(evaluateOffice(seedOffice, createBaselinePlan()), 'r:head-media', 'all', 'all');
    const changed = makeArchifyMap(evaluateOffice(seedOffice, departure()), 'r:head-media', 'all', 'all');
    expect(baseline.specification.connections.some(edge => edge.label === 'owns')).toBe(true);
    expect(changed.specification.connections.some(edge => edge.label === 'ownership removed')).toBe(true);
    expect(changed.specification.components.find(item => item.id === 'r_head-media')?.tag).toContain('unowned');
    expect(changed.specification).not.toEqual(baseline.specification);
  });
  it('keeps proposed handovers distinct from confirmed ownership', () => {
    const plan = departure();
    plan.repairs = [{ id: 'repair', roleId: 'head-media', candidateId: 'ellis', status: 'proposed', authorisedById: 'ava', ownerAccepted: false, authorityConfirmed: false, accessConfirmed: false, evidence: '', createdAt: '2026-11-04T09:01:00Z' }];
    const snapshot = evaluateOffice(seedOffice, plan);
    const map = makeArchifyMap(snapshot, 'r:head-media', 'all', 'all');
    expect(map.specification.connections.some(edge => map.nodeIds[edge.from] === 'p:ellis' && edge.label === 'proposed')).toBe(true);
    expect(map.specification.components.find(item => item.id === 'r_head-media')?.tag).toContain('proposed');
    expect(roleForNode(snapshot, 'p:ellis')).toBe('head-media');
  });
  it('uses only authored relationships and includes system dependencies in control detail', () => {
    const snapshot = evaluateOffice(seedOffice, departure());
    const map = makeArchifyMap(snapshot, 'c:campaign-approval', 'all', 'all');
    expect(Object.values(map.nodeIds)).toContain('s:campaign-board');
    for (const edge of map.specification.connections) expect(snapshot.edges.some(item => item.source === map.nodeIds[edge.from] && item.target === map.nodeIds[edge.to] && item.label === edge.label)).toBe(true);
    expect(map.specification.connections.some(edge => map.nodeIds[edge.from] === 'r:head-media' && map.nodeIds[edge.to] === 's:campaign-board')).toBe(false);
  });
  it('preserves unknown evidence and restricts category controls', () => {
    const snapshot = evaluateOffice(seedOffice, createBaselinePlan());
    const recovery = makeArchifyMap(snapshot, 'c:recovery-test', 'all', 'all');
    expect(recovery.specification.components.find(item => item.id === 'c_recovery-test')?.tag).toContain('unknown');
    const compliance = makeArchifyMap(snapshot, 'r:head-media', 'all', 'compliance');
    expect(Object.values(compliance.nodeIds).filter(id => id.startsWith('c:'))).toEqual(['c:media-rights']);
  });
});
