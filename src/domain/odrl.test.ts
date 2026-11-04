import { describe, expect, it } from 'vitest';
import jsonld from 'jsonld';
import { entityIri, exportPolicies, MANDATE, ODRL, ODRL_CONTEXT, parsePolicies, PROFILE, validatePolicyGraph, XSD } from './odrl';
import { seedOffice } from './seed';

const exported = () => exportPolicies(seedOffice.policyGraph);
describe('Mandate ODRL 2.2 profile', () => {
  it('grounds every source quote and confirmed alignment in existing office records', () => {
    expect(() => validatePolicyGraph(seedOffice)).not.toThrow();
    expect(seedOffice.policyGraph.documents).toHaveLength(4);
    expect(seedOffice.policyGraph.rules).toHaveLength(9);
  });

  it('round trips its canonical JSON-LD without losing rules, constraints or provenance', () => {
    const policies = exported();
    expect(parsePolicies(JSON.stringify(policies))).toEqual(policies);
    expect(policies.flatMap(p => p.obligation)).toHaveLength(7);
    expect(policies.flatMap(p => p.permission)).toHaveLength(1);
    expect(policies.flatMap(p => p.prohibition)).toHaveLength(1);
    expect(policies.every(p => p.profile === PROFILE)).toBe(true);
    expect(JSON.stringify(policies)).not.toMatch(/"(?:controlIds|state|evidence|ruleAlignments)":/);
  });

  it('expands to real ODRL RDF with an independent JSON-LD processor, offline', async () => {
    const policies = exported();
    const expanded = await jsonld.expand(policies as unknown as jsonld.JsonLdDocument, { documentLoader: async () => { throw new Error('Remote context fetch is forbidden.'); } });
    expect(expanded).toHaveLength(4);
    const release = expanded.find(p => p['@id'] === entityIri('policy', 'POL-01'))!;
    expect(release['@type']).toEqual([`${ODRL}Set`]);
    expect(release[`${ODRL}profile`]).toEqual([{ '@id': PROFILE }]);
    const duties = release[`${ODRL}obligation`] as Record<string, unknown>[];
    expect(duties[0]['@type']).toEqual([`${ODRL}Duty`]);
    expect(duties[0][`${ODRL}assignee`]).toEqual([{ '@id': entityIri('role', 'head-media') }]);
    expect(duties[0][`${ODRL}action`]).toEqual([{ '@id': `${MANDATE}approveCampaign` }]);
    const c = (duties[0][`${ODRL}constraint`] as Record<string, unknown>[])[0];
    expect(c[`${ODRL}rightOperand`]).toEqual([{ '@value': true, '@type': `${XSD}boolean` }]);
  });

  it.each([
    ['unknown profile', (p: ReturnType<typeof exported>) => { p[0].profile = 'urn:unknown:profile'; }],
    ['changed context', (p: ReturnType<typeof exported>) => { p[0]['@context'] = { ...ODRL_CONTEXT, action: { '@id': 'odrl:target', '@type': '@id' } } as unknown as typeof ODRL_CONTEXT; }],
    ['relative identity', (p: ReturnType<typeof exported>) => { p[0].obligation[0].assignee = 'head-media'; }],
    ['unknown action', (p: ReturnType<typeof exported>) => { p[0].obligation[0].action = `${MANDATE}guess`; }],
    ['wrong relationship', (p: ReturnType<typeof exported>) => { p[0].obligation[0]['@type'] = 'odrl:Permission'; }],
    ['duplicate rule', (p: ReturnType<typeof exported>) => { p[0].obligation.push(p[0].obligation[0]); }],
    ['empty policy', (p: ReturnType<typeof exported>) => { p[0].obligation = []; p[0].prohibition = []; }],
    ['unsupported temporal operand', (p: ReturnType<typeof exported>) => { p[0].obligation[0].constraint[0].leftOperand = `${MANDATE}unknown`; }],
    ['wrong datatype', (p: ReturnType<typeof exported>) => { p[0].obligation[0].constraint[0].rightOperand['@type'] = `${XSD}string`; }],
    ['negative duration', (p: ReturnType<typeof exported>) => { p[1].obligation[1].constraint[0].rightOperand['@value'] = '-P3M'; }],
    ['nested duty', (p: ReturnType<typeof exported>) => { Object.assign(p[0].prohibition[0], { remedy: [] }); }],
    ['inheritance', (p: ReturnType<typeof exported>) => { Object.assign(p[0], { inheritFrom: 'urn:other:policy' }); }],
  ])('rejects %s rather than silently discarding semantics', (_name, mutate) => {
    const policies = exported(); mutate(policies);
    expect(() => parsePolicies(JSON.stringify(policies))).toThrow();
  });

  it('rejects ungrounded quotes and invalid hierarchy or alignment references', () => {
    const office = structuredClone(seedOffice);
    office.policyGraph.rules[0].source.quote = 'Invented policy text';
    expect(() => validatePolicyGraph(office)).toThrow('substring');
    office.policyGraph = structuredClone(seedOffice.policyGraph);
    office.policyGraph.provisions[0].parentId = office.policyGraph.provisions[0].id;
    expect(() => validatePolicyGraph(office)).toThrow('hierarchy cycle');
    office.policyGraph = structuredClone(seedOffice.policyGraph);
    office.ruleAlignments[0].controlIds = ['missing'];
    expect(() => validatePolicyGraph(office)).toThrow('missing control');
  });

  it('rejects malformed or oversized input', () => {
    expect(() => parsePolicies('{')).toThrow();
    expect(() => parsePolicies('[]')).toThrow();
    expect(() => parsePolicies(' '.repeat(1_000_001))).toThrow('1 MB');
  });
});
