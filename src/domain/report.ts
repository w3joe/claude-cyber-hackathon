import type { Snapshot, Status } from './types';

const label: Record<Status, string> = { covered: 'Recorded coverage', 'at-risk': 'At risk', unowned: 'Unowned', proposed: 'Proposed — pending', verified: 'Verified in plan', unknown: 'Unknown — evidence review', inactive: 'Inactive' };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const cell = (value: unknown) => esc(value).replace(/\r?\n/g, ' ');
const md = (value: unknown) => String(value ?? '').replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]!).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const name = (snapshot: Snapshot, id: string | null | undefined) => snapshot.people.find(person => person.id === id)?.name ?? 'Not recorded';
const generated = () => new Date().toISOString();
const limitation = 'This report describes a local planning model using fictional sample office data. Recorded coverage and verification reflect the supplied records and user confirmations. No connected accounts, permissions, evidence documents or external systems were inspected or changed. This is not a compliance certificate, legal opinion or independent audit. Applicable requirements and real-world evidence must be confirmed separately.';

function ownershipRows(snapshot: Snapshot): string[][] {
  return snapshot.roles.map(role => [role.name, name(snapshot, role.baselineOwnerId), name(snapshot, role.ownerId), label[role.status], name(snapshot, role.accountablePersonId), role.reason]);
}

function repairRows(snapshot: Snapshot): string[][] {
  return snapshot.plan.repairs.map(repair => {
    const role = snapshot.roles.find(item => item.roleId === repair.roleId);
    const roleName = role?.name ?? repair.roleId;
    const effective = role?.repair?.id === repair.id ? label[role.status] : 'Not effective in current plan';
    return [roleName, name(snapshot, repair.candidateId), effective, name(snapshot, repair.authorisedById), `Authority: ${repair.authorityConfirmed ? 'recorded' : 'pending'}; acceptance: ${repair.ownerAccepted ? 'recorded' : 'pending'}; access/readiness: ${repair.accessConfirmed ? 'recorded' : 'pending'}`, repair.evidence || 'No evidence reference recorded', repair.createdAt];
  });
}

function requirementRows(snapshot: Snapshot): string[][] {
  return snapshot.requirements.map(impact => {
    const requirement = snapshot.office.requirements.find(item => item.id === impact.requirementId);
    return [impact.name, requirement?.source ?? 'Not recorded', requirement?.reference ?? 'Not recorded', label[impact.status], impact.reason];
  });
}

function evidenceRows(snapshot: Snapshot): string[][] {
  return snapshot.office.controls.map(control => [control.name, control.evidence.status, control.evidence.reference || 'Not recorded', control.evidence.checkedAt || 'Not recorded', snapshot.roles.find(role => role.roleId === control.roleId)?.name ?? control.roleId]);
}

function markdownTable(headers: string[], rows: string[][]): string {
  return [`| ${headers.map(md).join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.map(md).join(' | ')} |`)].join('\n');
}

export function buildReportMarkdown(snapshot: Snapshot): string {
  const lines = [
    '# Mandate — GRC impact planning report', '',
    `**Office:** ${md(snapshot.office.name)} · fictional sample`,
    `**Scenario:** ${md(snapshot.scenarioLabel)}`,
    `**Scenario created:** ${md(snapshot.plan.scenario.createdAt)}`,
    `**Report generated:** ${generated()}`, '',
    limitation, '',
    '## Scope and status', '',
    `${snapshot.summary.affected} map items affected; ${snapshot.summary.unowned} unowned responsibilities; ${snapshot.summary.proposed} proposed repairs; ${snapshot.summary.verified} repairs verified in the plan; ${snapshot.requirements.filter(r => ['unknown', 'at-risk', 'unowned', 'proposed'].includes(r.status)).length} requirements needing review. These are model counts, not a compliance score.`, '',
    '“Verified in plan” means the engine accepted the recorded handover checks. A proposed repair is outstanding work. Unknown evidence remains unknown after an ownership change.', '',
    '## Baseline ownership compared with the plan', '',
    markdownTable(['Responsibility', 'Baseline owner', 'Plan owner', 'Plan status', 'Accountable person', 'Explanation'], ownershipRows(snapshot)), '',
    '## Proposed and recorded handovers', '',
    ...(snapshot.plan.repairs.length ? [markdownTable(['Responsibility', 'Candidate', 'Effective plan status', 'Authorising person', 'Recorded checks', 'Evidence reference', 'Recorded at'], repairRows(snapshot))] : ['No handover has been proposed or recorded.']), '',
    '## Findings and next actions', '',
  ];
  if (!snapshot.findings.length) lines.push('No findings are recorded in this model. This does not establish that all real-world requirements are satisfied.', '');
  for (const finding of snapshot.findings) lines.push(
    `### ${md(finding.title)}`, '',
    `**Area:** ${md(finding.category)} · **Status:** ${label[finding.status]}`,
    `**Accountable:** ${md(name(snapshot, finding.accountablePersonId))}`, '',
    md(finding.description), '',
    `**Next action:** ${md(finding.action)}`,
    `**Evidence needed:** ${md(finding.evidenceNeeded)}`,
    `**Related requirements:** ${md(finding.requirementIds.map(id => snapshot.office.requirements.find(requirement => requirement.id === id)?.name ?? id).join('; ') || 'None recorded')}`, '',
  );
  lines.push('## Recorded requirements', '', markdownTable(['Requirement', 'Source', 'Reference', 'Plan status', 'Reason'], requirementRows(snapshot)), '', '## Evidence register', '', markdownTable(['Control', 'Evidence status', 'Reference', 'Last checked', 'Responsible role'], evidenceRows(snapshot)), '', '## Review before using this report', '', '- Confirm that the office map and authority chain reflect the actual organisation.', '- Confirm which policies, contracts and regulatory requirements apply.', '- Inspect the referenced evidence and validate the effective permissions and handovers.', '- Keep unresolved findings open and record the responsible decision-maker.', '', limitation, '');
  return lines.join('\n');
}

function htmlTable(headers: string[], rows: string[][]): string {
  return `<div class="table-wrap"><table><thead><tr>${headers.map(header => `<th scope="col">${cell(header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${cell(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function buildReportHtml(snapshot: Snapshot): string {
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(snapshot.office.name)} — GRC impact planning report</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f6f3;color:#20342b;font:15px/1.55 system-ui,-apple-system,sans-serif}main{max-width:1100px;margin:32px auto;padding:40px;background:#fff}header{border-bottom:3px solid #254e3b;padding-bottom:20px}h1{font-size:30px;line-height:1.2;margin:8px 0 16px;font-weight:600}h2{font-size:20px;margin:32px 0 12px}h3{font-size:16px;margin:0 0 8px}p{margin:8px 0}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:12px;color:#506657}.meta{font-size:13px;color:#4b5b51}.notice{background:#f3f5ee;border-left:3px solid #7e9470;padding:14px 18px;margin:20px 0;font-size:13px}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12px;line-height:1.45}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #dbe2dc;overflow-wrap:anywhere}th{background:#edf2ec;font-weight:600}article{padding:16px 0;border-bottom:1px solid #dbe2dc;break-inside:avoid}small{font-size:12px;color:#4b5b51}footer{margin-top:32px;font-size:12px;color:#4b5b51}@media(max-width:640px){main{margin:0;padding:20px}h1{font-size:25px}}@media print{@page{size:A4 landscape;margin:14mm}body{background:#fff;font-size:10pt}main{max-width:none;margin:0;padding:0}h1{font-size:22pt}h2{font-size:14pt}table{font-size:8pt}.table-wrap{overflow:visible}thead{display:table-header-group}tr{break-inside:avoid}.notice{background:#fff}h2,h3{break-after:avoid}}
</style></head><body><main>
<header><div class="eyebrow">Mandate · planning evidence</div><h1>GRC impact planning report</h1><p><strong>${esc(snapshot.office.name)}</strong> · fictional sample office</p><p>${esc(snapshot.scenarioLabel)}</p><div class="meta">Scenario created: ${esc(snapshot.plan.scenario.createdAt)}<br>Report generated: ${esc(generated())}</div></header>
<div class="notice">${esc(limitation)}</div>
<section><h2>Scope and status</h2><p>${snapshot.summary.affected} map items affected · ${snapshot.summary.unowned} unowned responsibilities · ${snapshot.summary.proposed} proposed repairs · ${snapshot.summary.verified} verified in plan · ${snapshot.requirements.filter(r => ['unknown', 'at-risk', 'unowned', 'proposed'].includes(r.status)).length} requirements needing review.</p><p><small>These are model counts, not a compliance score. “Verified in plan” means the engine accepted the recorded handover checks. Proposed repairs remain outstanding; an ownership repair does not resolve stale or missing evidence.</small></p></section>
<section><h2>Baseline ownership compared with the plan</h2>${htmlTable(['Responsibility', 'Baseline owner', 'Plan owner', 'Plan status', 'Accountable person', 'Explanation'], ownershipRows(snapshot))}</section>
<section><h2>Proposed and recorded handovers</h2>${snapshot.plan.repairs.length ? htmlTable(['Responsibility', 'Candidate', 'Effective plan status', 'Authorising person', 'Recorded checks', 'Evidence reference', 'Recorded at'], repairRows(snapshot)) : '<p>No handover has been proposed or recorded.</p>'}</section>
<section><h2>Findings and next actions</h2>${snapshot.findings.length ? snapshot.findings.map(finding => `<article><h3>${esc(finding.title)}</h3><p class="meta">${esc(finding.category)} · ${esc(label[finding.status])} · Accountable: ${esc(name(snapshot, finding.accountablePersonId))}</p><p>${esc(finding.description)}</p><p><strong>Next action:</strong> ${esc(finding.action)}</p><p><strong>Evidence needed:</strong> ${esc(finding.evidenceNeeded)}</p><p><small>Related requirements: ${esc(finding.requirementIds.map(id => snapshot.office.requirements.find(requirement => requirement.id === id)?.name ?? id).join('; ') || 'None recorded')}</small></p></article>`).join('') : '<p>No findings are recorded in this model. This does not establish that all real-world requirements are satisfied.</p>'}</section>
<section><h2>Recorded requirements</h2>${htmlTable(['Requirement', 'Source', 'Reference', 'Plan status', 'Reason'], requirementRows(snapshot))}</section>
<section><h2>Evidence register</h2>${htmlTable(['Control', 'Evidence status', 'Reference', 'Last checked', 'Responsible role'], evidenceRows(snapshot))}</section>
<section><h2>Review before using this report</h2><ul><li>Confirm that the office map and authority chain reflect the actual organisation.</li><li>Confirm which policies, contracts and regulatory requirements apply.</li><li>Inspect the referenced evidence and validate effective permissions and handovers.</li><li>Keep unresolved findings open and record the responsible decision-maker.</li></ul></section>
<footer>${esc(limitation)}</footer></main></body></html>`;
}
