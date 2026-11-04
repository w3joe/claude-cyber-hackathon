import { describe, expect, it } from 'vitest';
import { answerQuestion } from './questions';
import { createBaselinePlan, evaluateOffice } from './engine';
import { seedOffice } from './seed';
import type { Office } from './types';

const baseline = () => evaluateOffice(seedOffice, createBaselinePlan());
const mediaRole = () => seedOffice.roles.find(role => /media/i.test(role.name))!;
const directorRole = () => seedOffice.roles.find(role => /director/i.test(role.name) && !/media/i.test(role.name))!;

describe('local office questions', () => {
  it('previews a recognised departure without changing the current plan', () => {
    const snapshot = baseline();
    const before = JSON.stringify(snapshot);
    const answer = answerQuestion(`What happens if the ${mediaRole().name} leaves?`, snapshot);
    expect(answer.suggestedScenario?.kind).toBe('leave');
    expect(answer.suggestedScenario?.personId).toBe(mediaRole().ownerId);
    expect(answer.nodeIds).toContain(`r:${mediaRole().id}`);
    expect(answer.text).toContain('Nothing has changed yet');
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it('resolves the director independently from the head of media', () => {
    const answer = answerQuestion('What happens if the director leaves?', baseline());
    expect(answer.suggestedScenario?.personId).toBe(directorRole().ownerId);
    expect(answer.suggestedScenario?.personId).not.toBe(mediaRole().ownerId);
  });

  it('matches names without depending on case or accents', () => {
    const office = structuredClone(seedOffice) as Office;
    const owner = office.people.find(person => person.id === mediaRole().ownerId)!;
    owner.name = 'Émilie Durand';
    const answer = answerQuestion('What if EMILIE DURAND leaves?', evaluateOffice(office, createBaselinePlan()));
    expect(answer.suggestedScenario?.personId).toBe(owner.id);
  });

  it('asks for a specific subject instead of inventing a departure', () => {
    const answer = answerQuestion('What if someone leaves?', baseline());
    expect(answer.suggestedScenario).toBeUndefined();
    expect(answer.title).toBe('Which person would leave?');
    expect(answer.bullets.length).toBeGreaterThan(0);
  });

  it('does not choose between two explicitly named people', () => {
    const first = seedOffice.people.find(person => person.id === mediaRole().ownerId)!;
    const second = seedOffice.people.find(person => person.id === directorRole().ownerId)!;
    const answer = answerQuestion(`What if ${first.name} and ${second.name} leave?`, baseline());
    expect(answer.suggestedScenario).toBeUndefined();
    expect(answer.title).toContain('Choose one person');
  });

  it('does not propose removing an already inactive person again', () => {
    const plan = createBaselinePlan();
    plan.scenario = { id: 'already-left', kind: 'leave', personId: mediaRole().ownerId!, createdAt: '2026-11-04T12:00:00Z' };
    const snapshot = evaluateOffice(seedOffice, plan);
    const person = snapshot.people.find(item => item.id === mediaRole().ownerId)!;
    const answer = answerQuestion(`What if ${person.name} leaves?`, snapshot);
    expect(answer.suggestedScenario).toBeUndefined();
    expect(answer.title).toContain('already inactive');
  });

  it('grounds handover suggestions in recorded candidates', () => {
    const snapshot = baseline();
    const answer = answerQuestion(`Who can take over ${mediaRole().name}?`, snapshot);
    const role = snapshot.roles.find(item => item.roleId === mediaRole().id)!;
    for (const candidate of role.candidates) expect(answer.bullets.join(' ')).toContain(candidate.name);
    expect(answer.text).toContain('does not transfer authority');
    expect(answer.suggestedScenario).toBeUndefined();
  });

  it('reports evidence uncertainty instead of asserting compliance', () => {
    const answer = answerQuestion('What evidence is missing?', baseline());
    expect(answer.text).toContain('does not inspect connected systems');
    expect(answer.bullets.some(line => /stale|missing|record valid authority/i.test(line))).toBe(true);
  });

  it('gives the current requirement state with no regulatory conclusion', () => {
    const answer = answerQuestion('What compliance requirements are affected?', baseline());
    expect(answer.text).toContain('not an automatic legal or regulatory conclusion');
    expect(answer.nodeIds.every(id => /^(q|c):/.test(id))).toBe(true);
  });

  it('explains a specific control using its recorded reason and neighbours', () => {
    const snapshot = baseline();
    const control = snapshot.nodes.find(node => node.type === 'control')!;
    const answer = answerQuestion(`Why is ${control.label} affected?`, snapshot);
    expect(answer.nodeIds).toContain(control.id);
    expect(answer.bullets.join(' ')).toContain(control.reason);
  });

  it('rejects unsupported questions clearly', () => {
    const answer = answerQuestion('Tell me next week’s weather', baseline());
    expect(answer.title).toContain('outside the local question set');
    expect(answer.suggestedScenario).toBeUndefined();
    expect(answer.text).toContain('does not use an AI model');
  });

  it('does not invent reasons for an unrecorded entity', () => {
    const answer = answerQuestion('Why is the lunar base affected?', baseline());
    expect(answer.title).toContain('not identified');
    expect(answer.nodeIds).toEqual([]);
  });
});
