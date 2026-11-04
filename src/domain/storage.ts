import { seedOffice } from './seed';
import type { Person, Plan, Repair, Scenario } from './types';

const STORAGE_KEY = 'mandate-grc-plan-v1';
const RECOVERY_KEY = `${STORAGE_KEY}-recovery`;
const MAX_RAW_LENGTH = 200_000;
const peopleIds = new Set(seedOffice.people.map(person => person.id));
const roleIds = new Set(seedOffice.roles.map(role => role.id));
let recoveryRequired: string | null = null;

function invalid(message: string): never { throw new Error(message); }
function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${field} must be an object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string') invalid(`${field} must be text.`);
  const cleaned = value.trim();
  if ((!allowEmpty && cleaned.length === 0) || cleaned.length > maximum) invalid(`${field} must contain ${allowEmpty ? 'at most' : 'between 1 and'} ${maximum} characters.`);
  return cleaned;
}
function identifier(value: unknown, field: string): string {
  const id = text(value, field, 100);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(id)) invalid(`${field} contains unsupported characters.`);
  return id;
}
function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') invalid(`${field} must be true or false.`);
  return value;
}
function knownId(value: unknown, allowed: Set<string>, field: string, allowEmpty = false): string {
  if (allowEmpty && value === '') return '';
  const id = identifier(value, field);
  if (!allowed.has(id)) invalid(`${field} is not recorded in this office.`);
  return id;
}
function date(value: unknown, field: string): string {
  const timestamp = text(value, field, 40);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(timestamp);
  if (!match || !Number.isFinite(Date.parse(timestamp))) invalid(`${field} must be a valid date or ISO timestamp.`);
  const [, yearString, monthString, dayString, hours, minutes, seconds] = match;
  const year = Number(yearString); const month = Number(monthString); const day = Number(dayString);
  const calendarDate = new Date(`${yearString}-${monthString}-${dayString}T00:00:00.000Z`);
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() + 1 !== month || calendarDate.getUTCDate() !== day || (hours !== undefined && (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59))) invalid(`${field} must be a real calendar date and time.`);
  return timestamp;
}

function starter(value: unknown): Person {
  const input = record(value, 'New starter');
  const id = identifier(input.id, 'New starter ID');
  if (peopleIds.has(id)) invalid('The new starter ID already belongs to someone in this office.');
  if (!Array.isArray(input.skills) || input.skills.length > roleIds.size) invalid('New starter skills must be a short list of recorded role IDs.');
  const skills = input.skills.map(skill => knownId(skill, roleIds, 'New starter skill'));
  if (new Set(skills).size !== skills.length) invalid('New starter skills must not be duplicated.');
  const active = boolean(input.active, 'New starter active status');
  if (!active) invalid('A joining scenario needs an active new starter.');
  return { id, name: text(input.name, 'New starter name', 120), title: text(input.title, 'New starter title', 120), department: text(input.department, 'New starter department', 120), active, skills };
}

function scenario(value: unknown): Scenario {
  const input = record(value, 'Scenario');
  const id = identifier(input.id, 'Scenario ID');
  const createdAt = date(input.createdAt, 'Scenario creation date');
  switch (input.kind) {
    case 'baseline': return { id, kind: 'baseline', createdAt };
    case 'leave': return { id, kind: 'leave', personId: knownId(input.personId, peopleIds, 'Departing person'), createdAt };
    case 'move': return { id, kind: 'move', personId: knownId(input.personId, peopleIds, 'Moving person'), targetRoleId: knownId(input.targetRoleId, roleIds, 'Target role'), createdAt };
    case 'join': return { id, kind: 'join', targetRoleId: knownId(input.targetRoleId, roleIds, 'Target role'), newPerson: starter(input.newPerson), createdAt };
    default: return invalid('Scenario type must be baseline, leave, move or join.');
  }
}

/** Import checks establish shape and references; the engine still validates effective authority. */
export function parsePlan(raw: string): Plan {
  if (typeof raw !== 'string' || raw.length > MAX_RAW_LENGTH) invalid('This plan is too large to import. The limit is 200,000 characters.');
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { return invalid('This file is not valid JSON. Choose an exported Mandate plan.'); }
  const input = record(decoded, 'Plan');
  if (input.schemaVersion !== 1) invalid('This plan version is not supported. Choose a version 1 Mandate plan.');
  const nextScenario = scenario(input.scenario);
  if (!Array.isArray(input.repairs) || input.repairs.length > 30) invalid('A plan must contain a repairs list with no more than 30 entries.');
  const allowedPeople = new Set(peopleIds);
  if (nextScenario.newPerson) allowedPeople.add(nextScenario.newPerson.id);
  const repairIds = new Set<string>(); const repairedRoles = new Set<string>();
  const repairs: Repair[] = input.repairs.map((value: unknown) => {
    const item = record(value, 'Handover');
    const id = identifier(item.id, 'Handover ID');
    if (repairIds.has(id)) invalid('Handover IDs must not be duplicated.');
    repairIds.add(id);
    const roleId = knownId(item.roleId, roleIds, 'Handover role');
    if (repairedRoles.has(roleId)) invalid('Only one handover per role is allowed in a plan.');
    repairedRoles.add(roleId);
    if (item.status !== 'proposed' && item.status !== 'confirmed') invalid('Handover status must be proposed or confirmed.');
    return {
      id, roleId,
      candidateId: knownId(item.candidateId, allowedPeople, 'Handover candidate'),
      status: item.status,
      authorisedById: knownId(item.authorisedById, allowedPeople, 'Authorising person', true),
      ownerAccepted: boolean(item.ownerAccepted, 'Owner acceptance'),
      authorityConfirmed: boolean(item.authorityConfirmed, 'Authority confirmation'),
      accessConfirmed: boolean(item.accessConfirmed, 'Access confirmation'),
      evidence: text(item.evidence, 'Handover evidence', 2000, true),
      createdAt: date(item.createdAt, 'Handover creation date'),
    };
  });
  return { schemaVersion: 1, scenario: nextScenario, repairs };
}

function browserStorage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') throw new Error('Browser storage is unavailable.');
  return globalThis.localStorage;
}

function preserveRecovery(storage: Storage, raw: string): void {
  // Never replace an older recovery copy with a different unreadable plan.
  for (let index = 0; index < 100; index += 1) {
    const key = index === 0 ? RECOVERY_KEY : `${RECOVERY_KEY}-${index}`;
    const existing = storage.getItem(key);
    if (existing === raw) return;
    if (existing === null) { storage.setItem(key, raw); return; }
  }
  throw new Error('Recovery storage is full.');
}

export function loadPlan(): { plan: Plan | null; error: string } {
  let storage: Storage; let raw: string | null;
  try { storage = browserStorage(); raw = storage.getItem(STORAGE_KEY); }
  catch { return { plan: null, error: 'Saved plans are unavailable in this browser. Changes can still be exported as a file.' }; }
  if (raw === null) { recoveryRequired = null; return { plan: null, error: '' }; }
  try { const plan = parsePlan(raw); recoveryRequired = null; return { plan, error: '' }; }
  catch {
    recoveryRequired = raw;
    try {
      preserveRecovery(storage, raw);
      recoveryRequired = null;
      return { plan: null, error: 'The saved plan could not be read. Its original contents were preserved in a separate browser recovery copy; a new plan can be saved safely.' };
    } catch {
      return { plan: null, error: 'The saved plan could not be read or backed up. It has been kept unchanged, and browser saving is paused to avoid losing it. Export your current work as a file.' };
    }
  }
}

/** Returns a plain warning when persistence fails; an empty string means saved. */
export function savePlan(plan: Plan): string {
  let canonical: Plan;
  try { canonical = parsePlan(JSON.stringify(plan)); }
  catch (error) { return `This plan could not be saved. ${error instanceof Error ? error.message : 'Its contents are not valid.'}`; }
  try {
    const storage = browserStorage();
    // Also protect unreadable data when save is called without an earlier load.
    const previous = storage.getItem(STORAGE_KEY);
    if (previous !== null) {
      try { parsePlan(previous); } catch { recoveryRequired = previous; }
    }
    if (recoveryRequired !== null) {
      try { preserveRecovery(storage, recoveryRequired); recoveryRequired = null; }
      catch { return 'Browser saving is paused: the unreadable saved plan could not be backed up and has been kept unchanged. Export your current work as a file.'; }
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(canonical));
    return '';
  } catch { return 'The plan could not be saved in this browser. Your current work is still open; export it as a file to keep a copy.'; }
}
