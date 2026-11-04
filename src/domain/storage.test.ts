import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBaselinePlan, evaluateOffice } from './engine';
import { seedOffice } from './seed';
import { loadPlan, parsePlan, savePlan } from './storage';
import type { Plan, Repair } from './types';

const KEY = 'mandate-grc-plan-v1';
const RECOVERY = `${KEY}-recovery`;
function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return { get length() { return entries.size; }, clear() { entries.clear(); }, getItem(key) { return entries.get(key) ?? null; }, key(index) { return [...entries.keys()][index] ?? null; }, removeItem(key) { entries.delete(key); }, setItem(key, value) { entries.set(key, String(value)); } };
}
function proposal(overrides: Partial<Repair> = {}): Repair {
  return { id: 'repair-media', roleId: 'head-media', candidateId: 'ellis', status: 'proposed', authorisedById: '', ownerAccepted: false, authorityConfirmed: false, accessConfirmed: false, evidence: '', createdAt: '2026-11-04T12:00:00.000Z', ...overrides };
}
function departure(): Plan {
  return { schemaVersion: 1, scenario: { id: 'leave-maya', kind: 'leave', personId: 'maya', createdAt: '2026-11-04T12:00:00.000Z' }, repairs: [proposal()] };
}

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); loadPlan(); });

describe('plan import validation', () => {
  it('round-trips a valid plan using only the declared fields', () => {
    const plan = departure();
    expect(parsePlan(JSON.stringify(plan))).toEqual(plan);
  });

  it('rejects malformed JSON, unsupported versions and unknown people or roles', () => {
    expect(() => parsePlan('{broken')).toThrow('not valid JSON');
    expect(() => parsePlan(JSON.stringify({ ...departure(), schemaVersion: 2 }))).toThrow('version');
    expect(() => parsePlan(JSON.stringify({ ...departure(), scenario: { ...departure().scenario, personId: 'unknown-person' } }))).toThrow('not recorded');
    expect(() => parsePlan(JSON.stringify({ ...departure(), repairs: [proposal({ roleId: 'unknown-role' })] }))).toThrow('not recorded');
    expect(() => parsePlan(JSON.stringify({ ...departure(), repairs: [proposal({ candidateId: 'unknown-person' })] }))).toThrow('not recorded');
    expect(() => parsePlan(JSON.stringify({ ...departure(), repairs: [proposal({ authorisedById: 'unknown-person' })] }))).toThrow('not recorded');
  });

  it('rejects duplicate repair roles and duplicate repair IDs', () => {
    expect(() => parsePlan(JSON.stringify({ ...departure(), repairs: [proposal(), proposal({ id: 'other-id' })] }))).toThrow('one handover per role');
    expect(() => parsePlan(JSON.stringify({ ...departure(), repairs: [proposal(), proposal({ roleId: 'client-lead' })] }))).toThrow('IDs must not be duplicated');
  });

  it('bounds evidence, list size and raw document size', () => {
    expect(() => parsePlan(JSON.stringify({ ...departure(), repairs: [proposal({ evidence: 'a'.repeat(2001) })] }))).toThrow('2000');
    expect(() => parsePlan(JSON.stringify({ ...departure(), repairs: Array.from({ length: 31 }, () => proposal()) }))).toThrow('30');
    expect(() => parsePlan(' '.repeat(200001))).toThrow('too large');
  });

  it('rejects false calendar dates and non-boolean confirmations', () => {
    expect(() => parsePlan(JSON.stringify({ ...departure(), scenario: { ...departure().scenario, createdAt: '2026-02-30' } }))).toThrow('real calendar');
    expect(() => parsePlan(JSON.stringify({ ...departure(), scenario: { ...departure().scenario, createdAt: 'not-a-date' } }))).toThrow('valid date');
    expect(() => parsePlan(JSON.stringify({ ...departure(), repairs: [{ ...proposal(), ownerAccepted: 'true' }] }))).toThrow('true or false');
  });

  it('validates new starter references without allowing an existing identity to be replaced', () => {
    const plan: Plan = { schemaVersion: 1, scenario: { id: 'join-robin', kind: 'join', targetRoleId: 'assurance-coordinator', newPerson: { id: 'robin', name: 'Robin Green', title: 'Assurance Coordinator', department: 'Operations', active: true, skills: ['assurance-coordinator'] }, createdAt: '2026-11-04T12:00:00Z' }, repairs: [proposal({ roleId: 'assurance-coordinator', candidateId: 'robin' })] };
    expect(parsePlan(JSON.stringify(plan))).toEqual(plan);
    plan.scenario.newPerson!.id = 'maya';
    expect(() => parsePlan(JSON.stringify(plan))).toThrow('already belongs');
    plan.scenario.newPerson!.id = 'robin';
    plan.scenario.newPerson!.skills = ['super-admin'];
    expect(() => parsePlan(JSON.stringify(plan))).toThrow('not recorded');
  });

  it('strips injected properties at every object level', () => {
    const plan = departure();
    const raw = JSON.stringify({ ...plan, verified: true, __proto__: { compromised: true }, scenario: { ...plan.scenario, admin: true }, repairs: [{ ...plan.repairs[0], skipChecks: true }] });
    expect(parsePlan(raw)).toEqual(plan);
    expect(Object.prototype).not.toHaveProperty('compromised');
  });

  it('does not convert imported confirmation claims into verified coverage', () => {
    const plan = departure();
    plan.repairs = [proposal({ status: 'confirmed' })];
    const imported = parsePlan(JSON.stringify(plan));
    const snapshot = evaluateOffice(seedOffice, imported);
    expect(snapshot.roles.find(role => role.roleId === 'head-media')?.status).not.toBe('verified');
  });
});

describe('browser persistence and recovery', () => {
  it('loads an absent plan and saves and loads a valid plan', () => {
    expect(loadPlan()).toEqual({ plan: null, error: '' });
    expect(savePlan(departure())).toBe('');
    expect(loadPlan()).toEqual({ plan: departure(), error: '' });
  });

  it('backs up unreadable saved data before a fresh plan can replace it', () => {
    const raw = '{an unreadable previous plan';
    localStorage.setItem(KEY, raw);
    const loaded = loadPlan();
    expect(loaded.plan).toBeNull();
    expect(loaded.error).toContain('recovery copy');
    expect(localStorage.getItem(KEY)).toBe(raw);
    expect(localStorage.getItem(RECOVERY)).toBe(raw);
    expect(savePlan(createBaselinePlan())).toBe('');
    expect(localStorage.getItem(RECOVERY)).toBe(raw);
    expect(parsePlan(localStorage.getItem(KEY)!)).toEqual(createBaselinePlan());
  });

  it('preserves earlier recovery copies rather than overwriting them', () => {
    localStorage.setItem(RECOVERY, 'first unreadable plan');
    localStorage.setItem(KEY, 'second unreadable plan');
    loadPlan();
    expect(localStorage.getItem(RECOVERY)).toBe('first unreadable plan');
    expect(localStorage.getItem(`${RECOVERY}-1`)).toBe('second unreadable plan');
  });

  it('protects an unreadable plan even when saving occurs without loading first', () => {
    localStorage.setItem(KEY, '{old data');
    expect(savePlan(createBaselinePlan())).toBe('');
    expect(localStorage.getItem(RECOVERY)).toBe('{old data');
  });

  it('does not overwrite the old data if its recovery copy cannot be saved', () => {
    localStorage.setItem(KEY, '{preserve this');
    const originalSet = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if (key.startsWith(RECOVERY)) throw new Error('quota'); originalSet(key, value); });
    expect(loadPlan().error).toContain('saving is paused');
    expect(savePlan(createBaselinePlan())).toContain('saving is paused');
    expect(localStorage.getItem(KEY)).toBe('{preserve this');
  });

  it('reports denied browser storage without throwing', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadPlan().error).toContain('unavailable');
    expect(savePlan(createBaselinePlan())).toContain('could not be saved');
  });

  it('rejects an invalid in-memory plan before touching the saved copy', () => {
    savePlan(departure());
    const before = localStorage.getItem(KEY);
    expect(savePlan({ ...departure(), schemaVersion: 5 } as unknown as Plan)).toContain('could not be saved');
    expect(localStorage.getItem(KEY)).toBe(before);
  });
});
