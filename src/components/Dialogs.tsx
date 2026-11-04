import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCheck, GitBranch, ShieldCheck, UserMinus, UserPlus, X } from 'lucide-react';
import { seedOffice } from '../domain/seed';
import { getEligibleApprovers, validateRepair } from '../domain/engine';
import type { Repair, RoleImpact, Scenario, Snapshot } from '../domain/types';
import { now, uid } from './ui';

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,textarea,[tabindex="0"]') || []);
    focusable()[0]?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') { const items = focusable(); const first = items[0]; const last = items.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    };
    document.addEventListener('keydown', listener); return () => { document.removeEventListener('keydown', listener); previous?.focus(); };
  }, []);
  return ref;
}
export function ScenarioDialog({ kind, onClose, onApply }: { kind: 'leave' | 'join' | 'move'; onClose: () => void; onApply: (s: Scenario) => void }) {
  const ref = useDialog(onClose);
  const [personId, setPersonId] = useState('maya');
  const [targetRoleId, setTargetRoleId] = useState('assurance-coordinator');
  const [name, setName] = useState('Robin Taylor');
  const [qualified, setQualified] = useState(false);
  const [error, setError] = useState('');
  const role = seedOffice.roles.find(r => r.id === targetRoleId);
  const Icon = kind === 'leave' ? UserMinus : kind === 'join' ? UserPlus : GitBranch;
  function submit(e: React.FormEvent) {
    e.preventDefault(); if (kind === 'join' && name.trim().length < 2) { setError('Enter a name with at least two characters.'); return; }
    const scenario: Scenario = { id: uid(), kind, createdAt: now() };
    if (kind !== 'join') scenario.personId = personId;
    if (kind !== 'leave') scenario.targetRoleId = targetRoleId;
    if (kind === 'join') scenario.newPerson = { id: `starter-${uid()}`, name: name.trim(), title: role?.name || 'New starter', department: 'New starter', active: true, skills: qualified ? [targetRoleId] : [] };
    onApply(scenario);
  }
  return <div className="modal-backdrop"><section ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="scenario-title">
    <button className="icon-button modal-close" onClick={onClose} aria-label="Close scenario"><X size={20}/></button>
    <div className="modal-icon"><Icon size={24}/></div><span className="eyebrow">WHAT-IF SCENARIO</span><h2 id="scenario-title">{kind === 'leave' ? 'Simulate a departure' : kind === 'join' ? 'Plan a new starter' : 'Explore a role change'}</h2>
    <p className="muted">Explore a change against the original office. The previous plan remains available through Undo.</p>
    <form onSubmit={submit}>
      {kind === 'join' ? <label className="field">New starter’s name<input value={name} maxLength={80} onChange={e => setName(e.target.value)} required/></label> : <label className="field">Who is changing?<select value={personId} onChange={e => setPersonId(e.target.value)}>{seedOffice.people.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name} — {p.title}</option>)}</select></label>}
      {kind !== 'leave' && <label className="field">Proposed role<select value={targetRoleId} onChange={e => { setTargetRoleId(e.target.value); setQualified(false); }}>{seedOffice.roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.ownerId ? '' : ' · currently vacant'}</option>)}</select></label>}
      {kind === 'join' && <label className="check-field"><input type="checkbox" checked={qualified} onChange={e => setQualified(e.target.checked)}/><span>Record role suitability as a scenario assumption<small>This makes the starter a candidate. Handover and authority still need confirmation.</small></span></label>}
      <div className="scope-note"><ShieldCheck size={17}/><span>{kind === 'leave' ? 'IT offboarding stays separate. Explore the ownership and approval authority left behind.' : 'A role is proposed, not automatically authorised or verified.'}</span></div>
      {error && <p role="alert" className="error-text">{error}</p>}
      <button className="button primary full" type="submit">Explore impact <ArrowRight size={16}/></button>
    </form>
  </section></div>;
}

export function RepairDialog({ role, snapshot, onSave, onClose }: { role: RoleImpact; snapshot: Snapshot; onSave: (r: Repair) => void; onClose: () => void }) {
  const ref = useDialog(onClose);
  const [draft, setDraft] = useState<Repair>(() => role.repair || { id: uid(), roleId: role.roleId, candidateId: role.candidates[0]?.personId || '', status: 'proposed', authorisedById: '', ownerAccepted: false, authorityConfirmed: false, accessConfirmed: false, evidence: '', createdAt: now() });
  const [errors, setErrors] = useState<string[]>([]);
  const approvers = getEligibleApprovers(snapshot, role.roleId).filter(p => p.id !== draft.candidateId);
  const candidate = role.candidates.find(c => c.personId === draft.candidateId);
  function save(confirmed: boolean) { const next = { ...draft, status: confirmed ? 'confirmed' as const : 'proposed' as const }; const issues = validateRepair(snapshot, next); if (issues.length) { setErrors(issues); return; } onSave(next); }
  return <div className="modal-backdrop"><section ref={ref} className="modal repair-modal" role="dialog" aria-modal="true" aria-labelledby="repair-title">
    <button className="icon-button modal-close" onClick={onClose} aria-label="Close handover"><X size={20}/></button>
    <span className="eyebrow">SELF-HEALING / HUMAN CONFIRMATION</span><h2 id="repair-title">Repair the handover</h2><p className="muted">{role.name}</p>
    <label className="field">Proposed owner<select value={draft.candidateId} onChange={e => setDraft({ ...draft, candidateId: e.target.value, authorisedById: '', ownerAccepted: false, authorityConfirmed: false, accessConfirmed: false, evidence: '', status: 'proposed' })}>{!role.candidates.length && <option value="">No suitable candidate recorded</option>}{role.candidates.map(c => <option key={c.personId} value={c.personId}>{c.name} — {c.kind === 'authorised-deputy' ? 'recorded deputy' : c.kind === 'new-starter' ? 'new starter' : 'eligible candidate'}</option>)}</select></label>
    {candidate && <div className="candidate-reason"><GitBranch size={16}/><span>{candidate.reason}</span></div>}
    <label className="field">Authorised decision-maker<select value={draft.authorisedById} onChange={e => setDraft({ ...draft, authorisedById: e.target.value, authorityConfirmed: false, evidence: '', status: 'proposed' })}><option value="">Select from the authority chain</option>{approvers.map(p => <option key={p.id} value={p.id}>{p.name} — {p.title}</option>)}</select></label>
    {!approvers.length && <div className="notice warning">No independent decision-maker is available in the recorded chain. This gap must remain open.</div>}
    <div className="verification-fields">
      <label className="check-field"><input type="checkbox" checked={draft.authorityConfirmed} onChange={e => setDraft({ ...draft, authorityConfirmed: e.target.checked })}/><span>Authority is confirmed<small>The named decision-maker authorised this handover.</small></span></label>
      <label className="check-field"><input type="checkbox" checked={draft.ownerAccepted} onChange={e => setDraft({ ...draft, ownerAccepted: e.target.checked })}/><span>The new owner has accepted<small>Responsibilities and expectations were acknowledged.</small></span></label>
      <label className="check-field"><input type="checkbox" checked={draft.accessConfirmed} onChange={e => setDraft({ ...draft, accessConfirmed: e.target.checked })}/><span>Readiness has been checked<small>Required access, knowledge and handover material are available.</small></span></label>
    </div>
    <label className="field">Evidence reference<textarea value={draft.evidence} maxLength={2000} onChange={e => setDraft({ ...draft, evidence: e.target.value })} rows={3} placeholder="Handover HAND-014 accepted; access check ACCESS-021 completed."/><small>Record what was checked and its reference. This app does not independently inspect the evidence.</small></label>
    {errors.length > 0 && <div className="notice error" role="alert">{errors.map(x => <p key={x}>{x}</p>)}</div>}
    <div className="modal-actions"><button className="button" onClick={() => save(false)}>Save as proposed</button><button className="button primary" onClick={() => save(true)} disabled={!role.candidates.length}>Confirm recorded checks <CheckCheck size={16}/></button></div>
  </section></div>;
}
