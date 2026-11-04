import type { Snapshot, Status } from '../domain/types';
export const statusLabels: Record<Status, string> = { covered: 'Covered', 'at-risk': 'At risk', unowned: 'Unowned', proposed: 'Proposed', verified: 'Verified in plan', unknown: 'Needs evidence', inactive: 'Unavailable' };
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const personName = (s: Snapshot, id?: string | null) => s.people.find(p => p.id === id)?.name || 'No recorded owner';
export function Badge({ status }: { status: Status }) { return <span className={`status-badge ${status}`}><span/>{statusLabels[status]}</span>; }
export function download(content: string, filename: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
