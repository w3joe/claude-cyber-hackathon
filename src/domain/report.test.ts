import { describe, expect, it } from 'vitest';
import { buildReportHtml, buildReportMarkdown } from './report';
import { createBaselinePlan, evaluateOffice } from './engine';
import { seedOffice } from './seed';
import type { Repair } from './types';

const baseline = () => evaluateOffice(seedOffice, createBaselinePlan());

describe('planning reports', () => {
  it('includes evidence dates, sources and the limits of verification', () => {
    const snapshot = baseline();
    const report = buildReportMarkdown(snapshot);
    expect(report).toContain('fictional sample');
    expect(report).toContain('not a compliance certificate');
    expect(report).toContain('Baseline owner');
    expect(report).toContain('Plan owner');
    for (const control of seedOffice.controls) {
      expect(report).toContain(control.evidence.reference);
      expect(report).toContain(control.evidence.checkedAt);
    }
    for (const requirement of seedOffice.requirements) expect(report).toContain(requirement.reference);
  });

  it('keeps a proposed handover pending in the report', () => {
    const role = seedOffice.roles.find(item => /media/i.test(item.name))!;
    const plan = createBaselinePlan();
    plan.scenario = { id: 'leave-report', kind: 'leave', personId: role.ownerId!, createdAt: '2026-11-04T12:00:00Z' };
    const departure = evaluateOffice(seedOffice, plan);
    const impact = departure.roles.find(item => item.roleId === role.id)!;
    const repair: Repair = { id: 'report-proposal', roleId: role.id, candidateId: impact.candidates[0].personId, status: 'proposed', authorisedById: '', ownerAccepted: false, authorityConfirmed: false, accessConfirmed: false, evidence: '', createdAt: '2026-11-04T12:30:00Z' };
    plan.repairs = [repair];
    const snapshot = evaluateOffice(seedOffice, plan);
    const report = buildReportMarkdown(snapshot);
    expect(report).toContain('Proposed — pending');
    expect(report).toContain('No evidence reference recorded');
    expect(report).toContain('acceptance: pending');
    expect(report).toContain('A proposed repair is outstanding work');
  });

  it('does not report a forged confirmed repair as effective verification', () => {
    const snapshot = baseline();
    snapshot.plan.repairs.push({ id: 'forged', roleId: snapshot.roles[0].roleId, candidateId: snapshot.people[0].id, status: 'confirmed', authorisedById: '', ownerAccepted: false, authorityConfirmed: false, accessConfirmed: false, evidence: '', createdAt: '2026-11-04' });
    expect(buildReportMarkdown(snapshot)).toContain('Not effective in current plan');
  });

  it('escapes supplied text in the HTML report and contains no executable script', () => {
    const snapshot = baseline();
    snapshot.office.name = '<script>alert("office")</script>';
    snapshot.scenarioLabel = '<img src=x onerror=alert(1)>';
    snapshot.roles[0].reason = 'A & B < C "quoted"';
    snapshot.office.controls[0].evidence.reference = '<svg onload=alert(1)>';
    const report = buildReportHtml(snapshot);
    expect(report).toContain('&lt;script&gt;');
    expect(report).toContain('&lt;img');
    expect(report).toContain('&lt;svg');
    expect(report).toContain('A &amp; B &lt; C &quot;quoted&quot;');
    expect(report).not.toMatch(/<script\b|<img\b|<svg\b/i);
    expect(report).not.toContain('src="http');
    expect(report).not.toContain('href="http');
  });

  it('escapes markdown table delimiters and raw HTML', () => {
    const snapshot = baseline();
    snapshot.roles[0].reason = 'A | B\n<script>bad</script>';
    const report = buildReportMarkdown(snapshot);
    expect(report).toContain('A \\| B &lt;script&gt;bad&lt;/script&gt;');
    expect(report).not.toContain('<script>');
  });

  it('renders all supplied findings with next actions and evidence needed', () => {
    const snapshot = baseline();
    const report = buildReportHtml(snapshot);
    expect(report).toContain('@media print');
    for (const finding of snapshot.findings) {
      expect(report).toContain(finding.title.replaceAll('&', '&amp;'));
      expect(report).toContain('Evidence needed:');
      expect(report).toContain('Next action:');
    }
  });
});
