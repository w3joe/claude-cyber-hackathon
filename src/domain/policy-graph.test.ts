import { describe, expect, it } from 'vitest';
import { createBaselinePlan, evaluateOffice } from './engine';
import { entityIri, MANDATE } from './odrl';
import { combineStatus, deriveControlLinks, rulesForProvision } from './policy-graph';
import { seedOffice } from './seed';
import type { Office } from './types';

const id = (label: string) => entityIri('rule', label);
const baseline = (office = seedOffice) => evaluateOffice(office, createBaselinePlan());
const leaving = (office = seedOffice, personId = 'maya') => evaluateOffice(office, { ...createBaselinePlan(), scenario: { id: 'leave', kind: 'leave', personId, createdAt: '2026-11-04' } });
const legacyLinks = {
  'campaign-approval': ['release-policy'], 'media-rights': ['media-permissions'], 'publisher-review': ['access-policy'],
  'access-removal': ['access-policy'], 'recovery-test': ['recovery-policy'], 'customer-signoff': ['customer-approval'],
};

describe('policy graph coverage', () => {
  it('derives exactly the previous control links and ignores authored requirementIds', () => {
    const office = structuredClone(seedOffice);
    for (const control of office.controls) control.requirementIds = ['forged'];
    expect(Object.fromEntries(deriveControlLinks(office).map(c => [c.id, c.requirementIds]))).toEqual(legacyLinks);
    expect(baseline(office).edges.some(e => e.target === 'q:forged')).toBe(false);
  });

  it('preserves the legacy requirement status for all departure scenarios except the new retention gap', () => {
    const office = structuredClone(seedOffice);
    office.policyGraph.rules = office.policyGraph.rules.filter(r => r.id !== id('SOW-04-5.2'));
    for (const snapshot of [baseline(office), ...office.people.map(p => leaving(office, p.id))]) {
      for (const requirement of snapshot.requirements) {
        const statuses = snapshot.office.controls.filter(c => c.requirementIds.includes(requirement.requirementId)).map(c => snapshot.nodes.find(n => n.id === `c:${c.id}`)!.status);
        expect(requirement.status).toBe(combineStatus(statuses));
      }
    }
  });

  it('expands references and descendants once, including cyclic cross-references', () => {
    const graph = structuredClone(seedOffice.policyGraph);
    const removal = graph.provisions.find(p => p.id === entityIri('provision', 'POL-02-2'))!;
    const reference = graph.provisions.find(p => p.id === entityIri('provision', 'POL-02-4'))!;
    removal.refersTo.push(reference.id);
    const rules = rulesForProvision(graph, reference.id);
    expect(rules.map(r => r.id).sort()).toEqual([id('POL-02-2'), id('POL-02-4')].sort());
    expect(new Set(rules.map(r => r.id)).size).toBe(rules.length);
  });

  it('discovers the unmatched retention clause, quotes it in a finding and changes its requirement', () => {
    const snapshot = baseline();
    expect(snapshot.rules.find(r => r.ruleId === id('SOW-04-5.2'))).toMatchObject({ status: 'unknown', failing: 'alignment', evaluation: 'not-evaluated' });
    expect(snapshot.findings.find(f => f.title === 'Obligation without a control')?.description).toContain('at least 24 months');
    expect(snapshot.requirements.find(r => r.requirementId === 'media-permissions')?.status).toBe('unknown');
    expect(snapshot.nodes.find(n => n.id === 'q:media-permissions')?.subtitle).toBe('1/2 rules covered');
  });

  it('carries subject loss through rules and leaves stale evidence unknown at the control part', () => {
    const snapshot = leaving();
    for (const label of ['POL-01-3', 'POL-02-3']) expect(snapshot.rules.find(r => r.ruleId === id(label))).toMatchObject({ status: 'at-risk', failing: 'assignee', affected: true });
    expect(baseline().rules.find(r => r.ruleId === id('POL-03-2'))).toMatchObject({ status: 'unknown', failing: 'control' });
  });

  it('cannot promote suggested alignments into coverage or derived links', () => {
    const office = structuredClone(seedOffice);
    office.ruleAlignments.filter(a => a.controlIds.includes('campaign-approval')).forEach(a => { a.state = 'suggested'; });
    expect(baseline(office).rules.find(r => r.ruleId === id('POL-01-3'))?.status).toBe('unknown');
    expect(deriveControlLinks(office).find(c => c.id === 'campaign-approval')?.requirementIds).toEqual([]);
  });

  it('never treats covered controls as duty fulfilment, a permission grant or absence of infringement', () => {
    const snapshot = baseline();
    for (const kind of ['obligation', 'permission', 'prohibition']) {
      const rule = snapshot.office.policyGraph.rules.find(r => r.kind === kind)!;
      const impact = snapshot.rules.find(r => r.ruleId === rule.id)!;
      expect(impact.status).toBe('covered');
      expect(impact.evaluation).toBe('not-evaluated');
    }
    expect(snapshot.rules.find(r => r.ruleId === id('POL-02-3'))?.evaluationReason).toContain('timing conditions');
    expect(snapshot.rules.find(r => r.ruleId === id('POL-02-4'))?.evaluationReason).toContain('Exercise is optional');
    expect(snapshot.rules.find(r => r.ruleId === id('POL-01-3.1'))?.evaluationReason).toContain('forbidden action');
  });

  it('invalidates the entire policy assessment on a potential opposing-rule conflict', () => {
    const office: Office = structuredClone(seedOffice);
    const forbidden = office.policyGraph.rules.find(r => r.kind === 'prohibition')!;
    forbidden.action = `${MANDATE}approveCampaign`;
    const duty = office.policyGraph.rules.find(r => r.id === id('POL-01-3'))!;
    const permission = { ...structuredClone(duty), id: id('conflicting-permission'), kind: 'permission' as const };
    office.policyGraph.rules.push(permission);
    office.ruleAlignments.push({ ...structuredClone(office.ruleAlignments[0]), ruleId: permission.id });
    const snapshot = baseline(office);
    for (const rule of [forbidden, duty, permission]) expect(snapshot.rules.find(r => r.ruleId === rule.id)).toMatchObject({ status: 'unknown', failing: 'alignment' });
    expect(snapshot.findings.some(f => f.title === 'Policy rule conflict')).toBe(true);
  });

  it('cannot assess unsupported policy semantics', () => {
    const office = structuredClone(seedOffice);
    office.policyGraph.rules[0].action = 'urn:unknown:action';
    expect(baseline(office).rules.every(r => r.status === 'unknown')).toBe(true);
    expect(baseline(office).rules[0].reason).toContain('Unsupported ODRL action');
  });

  it('does not cover missing roles, systems or controls', () => {
    for (const field of ['roles', 'systems', 'controls'] as const) {
      const office = structuredClone(seedOffice);
      office[field] = [];
      expect(baseline(office).rules.every(r => r.status === 'unknown' || r.status === 'at-risk')).toBe(true);
    }
  });
});
