import { describe, expect, it } from 'vitest';
import { createBaselinePlan, evaluateOffice, getEligibleApprovers, validateRepair } from './engine';
import { seedOffice } from './seed';
import type { Office, Plan, Repair, Snapshot } from './types';

const departure = (personId = 'maya'): Plan => ({ ...createBaselinePlan(), scenario: { id: `leave-${personId}`, kind: 'leave', personId, createdAt: '2026-11-04T10:00:00Z' } });
const repair = (overrides: Partial<Repair> = {}): Repair => ({ id: 'handover-media', roleId: 'head-media', candidateId: 'ellis', status: 'confirmed', authorisedById: 'ava', ownerAccepted: true, authorityConfirmed: true, accessConfirmed: true, evidence: 'HANDOVER-042: signed acceptance and publishing-access review', createdAt: '2026-11-04T10:15:00Z', ...overrides });
const node = (snapshot: Snapshot, id: string) => snapshot.nodes.find(item => item.id === id)!;

describe('baseline and scoped propagation', () => {
  it('evaluates deterministically without mutating the office or plan', () => {
    const office = structuredClone(seedOffice);
    const plan = createBaselinePlan();
    const original = JSON.stringify({ office, plan });
    const first = evaluateOffice(office, plan);
    expect(evaluateOffice(office, plan)).toEqual(first);
    expect(JSON.stringify({ office, plan })).toBe(original);
    expect(first.affectedNodeIds).toEqual([]);
    expect(first.nodes.filter(item => item.type === 'control' && item.status === 'covered')).toHaveLength(5);
    expect(node(first, 'c:recovery-test').status).toBe('unknown');
    expect(node(first, 'q:recovery-policy').status).toBe('unknown');
  });

  it('removes a departing owner, keeps the role, and traces control and requirement gaps', () => {
    const result = evaluateOffice(seedOffice, departure());
    expect(result.people.find(person => person.id === 'maya')?.active).toBe(false);
    expect(result.roles.find(role => role.roleId === 'head-media')).toMatchObject({ ownerId: null, status: 'unowned', accountablePersonId: 'ava' });
    for (const id of ['campaign-approval', 'media-rights', 'publisher-review']) expect(node(result, `c:${id}`).status).toBe('unowned');
    expect(node(result, 'q:media-permissions').status).toBe('at-risk');
    expect(node(result, 's:publishing-console').reason).toContain('No confirmed system owner');
    expect(node(result, 'c:media-rights').reason).toContain('Head of Media has no confirmed owner');
  });

  it('preserves unrelated identities, systems and controls', () => {
    const before = evaluateOffice(seedOffice, createBaselinePlan());
    const after = evaluateOffice(seedOffice, departure());
    for (const id of ['p:theo', 'r:it-lead', 's:identity-console', 'c:access-removal']) expect(node(after, id)).toEqual(node(before, id));
  });

  it('distinguishes a recorded deputy from an eligible senior candidate', () => {
    const media = evaluateOffice(seedOffice, departure()).roles.find(role => role.roleId === 'head-media')!;
    expect(media.candidates.find(candidate => candidate.personId === 'ellis')).toMatchObject({ kind: 'authorised-deputy', requiresAuthorisation: true });
    expect(media.candidates.find(candidate => candidate.personId === 'ava')).toMatchObject({ kind: 'eligible', requiresAuthorisation: true });
    expect(media.candidates.some(candidate => candidate.personId === 'maya')).toBe(false);
    expect(media.candidates.find(candidate => candidate.personId === 'sam')?.kind).toBe('eligible');
    expect(media.ownerId).toBeNull();
  });

  it('escalates accountability through the configured chain when a senior owner leaves', () => {
    const result = evaluateOffice(seedOffice, departure('ava'));
    expect(result.roles.find(role => role.roleId === 'managing-director')?.ownerId).toBeNull();
    expect(result.roles.find(role => role.roleId === 'head-media')).toMatchObject({ ownerId: 'maya', accountablePersonId: 'priya', status: 'covered' });
    expect(node(result, 'r:head-media').reason).toContain('Accountability escalates to Priya');
    expect(getEligibleApprovers(result, 'head-media').map(person => person.id)).toEqual(['priya']);
  });

  it('terminates on malformed accountability cycles without inventing a fallback approver', () => {
    const office: Office = structuredClone(seedOffice);
    office.roles.find(role => role.id === 'managing-director')!.accountableRoleId = 'head-media';
    office.roles.find(role => role.id === 'head-media')!.ownerId = null;
    const result = evaluateOffice(office, departure('ava'));
    expect(getEligibleApprovers(result, 'head-media')).toEqual([]);
    expect(result.roles.find(role => role.roleId === 'head-media')?.accountablePersonId).toBeNull();
    expect(node(result, 'r:head-media').reason).toContain('No active owner');
  });
});

describe('joining and moving', () => {
  it('adds an eligible new starter as a pending candidate without assigning ownership', () => {
    const plan: Plan = { ...createBaselinePlan(), scenario: { id: 'join-lee', kind: 'join', targetRoleId: 'assurance-coordinator', newPerson: { id: 'lee', name: 'Lee Park', title: 'Assurance Coordinator', department: 'Operations', active: true, skills: ['assurance-coordinator'] }, createdAt: '2026-11-04T10:00:00Z' } };
    const result = evaluateOffice(seedOffice, plan);
    expect(result.roles.find(role => role.roleId === 'assurance-coordinator')).toMatchObject({ ownerId: null, status: 'proposed' });
    expect(result.roles.find(role => role.roleId === 'assurance-coordinator')?.candidates.find(candidate => candidate.personId === 'lee')?.kind).toBe('new-starter');
    expect(result.summary.verified).toBe(0);
    expect(node(result, 'p:lee').status).toBe('proposed');
  });

  it('does not make an unqualified starter eligible merely by selecting a target role', () => {
    const plan: Plan = { ...createBaselinePlan(), scenario: { id: 'join-lee', kind: 'join', targetRoleId: 'head-media', newPerson: { id: 'lee', name: 'Lee Park', title: 'Starter', department: 'Media', active: true, skills: [] }, createdAt: '2026-11-04T10:00:00Z' } };
    const result = evaluateOffice(seedOffice, plan);
    expect(validateRepair(result, repair({ candidateId: 'lee' })).join(' ')).toContain('not a recorded deputy');
    expect(result.roles.find(role => role.roleId === 'head-media')?.ownerId).toBe('maya');
  });

  it('vacates old responsibilities on a move without confirming the target appointment', () => {
    const plan: Plan = { ...createBaselinePlan(), scenario: { id: 'move-maya', kind: 'move', personId: 'maya', targetRoleId: 'assurance-coordinator', createdAt: '2026-11-04T10:00:00Z' } };
    const result = evaluateOffice(seedOffice, plan);
    expect(result.people.find(person => person.id === 'maya')?.active).toBe(true);
    expect(result.roles.find(role => role.roleId === 'head-media')?.ownerId).toBeNull();
    expect(result.roles.find(role => role.roleId === 'assurance-coordinator')).toMatchObject({ ownerId: null, status: 'proposed' });
    expect(result.summary.verified).toBe(0);
  });
});

describe('handover authority and evidence', () => {
  it('allows a deputy proposal but does not treat it as an appointment', () => {
    const proposed = repair({ status: 'proposed', authorisedById: '', ownerAccepted: false, authorityConfirmed: false, accessConfirmed: false, evidence: '' });
    const plan = { ...departure(), repairs: [proposed] };
    const result = evaluateOffice(seedOffice, plan);
    expect(validateRepair(result, proposed)).toEqual([]);
    expect(result.roles.find(role => role.roleId === 'head-media')).toMatchObject({ ownerId: null, status: 'proposed' });
    expect(node(result, 'c:campaign-approval').status).toBe('proposed');
    expect(result.summary.verified).toBe(0);
  });

  it.each([
    ['missing evidence', { evidence: '' }],
    ['vague evidence', { evidence: 'done' }],
    ['missing authoriser', { authorisedById: '' }],
    ['unauthorised person', { authorisedById: 'theo' }],
    ['self-authorisation', { candidateId: 'ava', authorisedById: 'ava' }],
    ['missing acceptance', { ownerAccepted: false }],
    ['missing authority check', { authorityConfirmed: false }],
    ['missing access check', { accessConfirmed: false }],
    ['ineligible candidate', { candidateId: 'theo' }],
    ['departed candidate', { candidateId: 'maya' }],
  ] as [string, Partial<Repair>][])('rejects a forged confirmation with %s', (_label, overrides) => {
    const bad = repair(overrides);
    const result = evaluateOffice(seedOffice, { ...departure(), repairs: [bad] });
    expect(validateRepair(result, bad).length).toBeGreaterThan(0);
    expect(result.roles.find(role => role.roleId === 'head-media')).toMatchObject({ ownerId: null, status: 'unowned' });
    expect(result.summary.verified).toBe(0);
    expect(node(result, 'r:head-media').reason).toContain('Handover was not applied');
  });

  it('applies a properly authorised, evidenced handover to an eligible active deputy', () => {
    const record = repair();
    const result = evaluateOffice(seedOffice, { ...departure(), repairs: [record] });
    expect(validateRepair(result, record)).toEqual([]);
    expect(result.roles.find(role => role.roleId === 'head-media')).toMatchObject({ ownerId: 'ellis', status: 'verified' });
    expect(node(result, 'c:campaign-approval').status).toBe('verified');
    expect(node(result, 'q:media-permissions').status).toBe('verified');
    expect(result.edges.some(edge => edge.source === 'p:ellis' && edge.target === 'r:head-media' && edge.label === 'handover recorded')).toBe(true);
  });

  it('keeps stale control evidence unknown after the ownership and dependency gaps are repaired', () => {
    const result = evaluateOffice(seedOffice, { ...departure(), repairs: [repair()] });
    expect(node(result, 'c:recovery-test').status).toBe('unknown');
    expect(node(result, 'q:recovery-policy').status).toBe('unknown');
    expect(node(result, 'c:recovery-test').reason).toContain('Ownership repair cannot refresh it');
    expect(result.findings.find(finding => finding.controlId === 'recovery-test')?.action).toContain('changing the owner is insufficient');
  });

  it('allows a confirmed new-starter appointment only after all checks are recorded', () => {
    const plan: Plan = { ...createBaselinePlan(), scenario: { id: 'join-lee', kind: 'join', targetRoleId: 'assurance-coordinator', newPerson: { id: 'lee', name: 'Lee Park', title: 'Assurance Coordinator', department: 'Operations', active: true, skills: ['assurance-coordinator'] }, createdAt: '2026-11-04T10:00:00Z' }, repairs: [repair({ roleId: 'assurance-coordinator', candidateId: 'lee', authorisedById: 'priya' })] };
    const result = evaluateOffice(seedOffice, plan);
    expect(result.roles.find(role => role.roleId === 'assurance-coordinator')).toMatchObject({ ownerId: 'lee', status: 'verified' });
    expect(node(result, 'p:lee').status).toBe('verified');
    expect(node(result, 'c:recovery-test').status).toBe('unknown');
  });
});
