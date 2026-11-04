import type { Category, EntityType, GraphNode, Snapshot, Status } from './types';

export interface ArchifyComponent {
  id: string; type: 'external' | 'backend' | 'cloud' | 'security' | 'database';
  label: string; sublabel: string; tag?: string; pos: [number, number]; size: [number, number];
}
export interface ArchifyConnection {
  id: string; from: string; to: string; label: string; variant: 'default' | 'emphasis' | 'dashed';
  fromSide?: 'left' | 'right' | 'top' | 'bottom'; toSide?: 'left' | 'right' | 'top' | 'bottom';
  labelDx?: number; labelDy?: number;
  labelAt?: [number, number];
}
export interface ArchifySpecification {
  schema_version: 1; diagram_type: 'architecture';
  meta: { title: string; locale: 'en'; quality_profile: 'showcase'; legend: { mode: 'auto'; entries: Record<string, { label: string }> }; views: { id: string; label: string; focus: string[]; note: string }[] };
  components: ArchifyComponent[]; connections: ArchifyConnection[];
  cards: { dot: 'amber' | 'slate' | 'emerald'; title: string; items: string[] }[];
}
export interface ArchifyMap {
  specification: ArchifySpecification; nodeIds: Record<string, string>; roleId: string;
  controlId: string | null; availableControlIds: string[]; empty: boolean; scope: string;
}

const kinds: Record<EntityType, ArchifyComponent['type']> = { person: 'external', role: 'backend', system: 'cloud', control: 'security', requirement: 'database' };
const labels: Record<EntityType, string> = { person: 'Person', role: 'Responsibility', system: 'System', control: 'Control', requirement: 'Requirement' };
const statuses: Record<Status, string> = { covered: 'covered', 'at-risk': 'at risk', unowned: 'unowned', proposed: 'proposed', verified: 'verified', unknown: 'unknown', inactive: 'inactive' };
const short = (text: string, max = 27) => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
const archifyId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_');
const conciseLabels: Record<string, string> = {
  'media-rights': 'Licence & permission checks',
  'publisher-review': 'Publishing admin review',
  'media-permissions': 'Customer media permission',
  'customer-approval': 'Customer release approval',
};

export function roleForNode(snapshot: Snapshot, id: string | null): string {
  const node = snapshot.nodes.find(item => item.id === id);
  if (node?.type === 'role') return node.entityId;
  if (node?.type === 'control') return snapshot.office.controls.find(item => item.id === node.entityId)?.roleId ?? 'head-media';
  if (node?.type === 'system') return snapshot.office.systems.find(item => item.id === node.entityId)?.roleId ?? 'head-media';
  if (node?.type === 'requirement') return snapshot.office.controls.find(item => item.requirementIds.includes(node.entityId))?.roleId ?? 'head-media';
  if (node?.type === 'person') {
    const scenario = snapshot.plan.scenario;
    if (scenario.targetRoleId && (scenario.personId === node.entityId || scenario.newPerson?.id === node.entityId)) return scenario.targetRoleId;
    return snapshot.roles.find(item => item.repair?.candidateId === node.entityId)?.roleId
      ?? snapshot.roles.find(item => item.ownerId === node.entityId)?.roleId
      ?? snapshot.office.roles.find(item => item.ownerId === node.entityId)?.id ?? 'head-media';
  }
  return snapshot.office.roles.find(item => item.id === 'head-media')?.id ?? snapshot.office.roles[0].id;
}

export function selectionForMap(selectedNodeId: string | null, highlightedNodeIds: string[]): string | null {
  return selectedNodeId ?? highlightedNodeIds.find(id => id.startsWith('r:')) ?? highlightedNodeIds.find(id => id.startsWith('c:')) ?? highlightedNodeIds[0] ?? null;
}

export function makeArchifyMap(snapshot: Snapshot, selectedNodeId: string | null, focus: 'all' | 'affected', category: 'all' | Category): ArchifyMap {
  const roleId = roleForNode(snapshot, selectedNodeId);
  const role = snapshot.office.roles.find(item => item.id === roleId)!;
  const selected = snapshot.nodes.find(item => item.id === selectedNodeId);
  const controlId = selected?.type === 'control' ? selected.entityId : null;
  const availableControls = snapshot.office.controls.filter(item => item.roleId === roleId);
  const controls = availableControls.filter(item => (!controlId || item.id === controlId)
    && (category === 'all' || item.category === category)
    && (focus === 'all' || snapshot.nodes.some(node => node.id === `c:${item.id}` && node.affected)));
  const nodes = new Map(snapshot.nodes.map(node => [node.id, node]));
  const included = new Map<string, { node: GraphNode; position: [number, number] }>();
  const add = (id: string, position: [number, number]) => { const node = nodes.get(id); if (node) included.set(id, { node, position }); };
  const roleNodeId = `r:${roleId}`;
  const incoming = snapshot.edges.filter(edge => edge.target === roleNodeId && edge.source.startsWith('p:'));
  const personEdge = incoming.find(edge => edge.label === 'proposed') ?? incoming.find(edge => edge.label === 'handover recorded') ?? incoming[0];
  const childRoles = snapshot.office.roles.filter(item => item.accountableRoleId === roleId);
  const ownedSystems = snapshot.office.systems.filter(item => item.roleId === roleId);
  const rows = controls.length || Math.max(childRoles.length + ownedSystems.length, 1);
  const centreY = 50 + Math.floor((rows - 1) / 2) * 200;
  add(roleNodeId, [340, centreY]);
  if (personEdge) add(personEdge.source, [0, centreY]);
  if (role.accountableRoleId) add(`r:${role.accountableRoleId}`, [340, centreY - 200]);

  if (controlId && controls.length) {
    const control = controls[0];
    add(`c:${control.id}`, [770, centreY]);
    control.requirementIds.forEach((id, index) => add(`q:${id}`, [1110, centreY + index * 200]));
    control.systemIds.forEach((id, index) => add(`s:${id}`, [770, centreY - (index + 1) * 200]));
  } else if (controls.length) {
    controls.forEach((control, index) => {
      const y = 50 + index * 200;
      add(`c:${control.id}`, [770, y]);
      control.requirementIds.forEach((id, requirementIndex) => add(`q:${id}`, [1110, y + requirementIndex * 150]));
    });
  } else {
    [...childRoles.map(item => `r:${item.id}`), ...ownedSystems.map(item => `s:${item.id}`)]
      .filter(id => focus === 'all' || nodes.get(id)?.affected)
      .forEach((id, index) => add(id, [770, 50 + index * 180]));
  }

  // The architecture renderer preserves exact relationship direction and labels.
  // Overview deliberately separates system dependencies into the selected-control detail.
  const graphEdges = snapshot.edges.filter(edge => included.has(edge.source) && included.has(edge.target));
  const connections: ArchifyConnection[] = graphEdges.map((edge, index) => ({
    id: `relationship_${index}`, from: archifyId(edge.source), to: archifyId(edge.target), label: edge.label,
    variant: edge.label === 'ownership removed' || edge.label === 'proposed' ? 'dashed' : edge.affected ? 'emphasis' : 'default',
  }));
  const minimumY = Math.min(...[...included.values()].map(item => item.position[1]));
  connections.forEach((connection, index) => {
    const source = included.get(graphEdges[index].source)!;
    const target = included.get(graphEdges[index].target)!;
    if (source.position[0] === target.position[0]) {
      connection.labelAt = [source.position[0] + 140, (source.position[1] + target.position[1] + 90) / 2 - minimumY + 43];
    } else if (source.node.type === 'role') {
      connection.labelAt = [source.position[0] + 240 + (target.position[0] - source.position[0] - 200) * 0.78, target.position[1] - minimumY + 88];
    }
  });
  const components = [...included.values()].map(({ node, position }) => ({
    id: archifyId(node.id), type: kinds[node.type], label: conciseLabels[node.entityId] ?? node.label,
    sublabel: node.type === 'requirement' ? node.subtitle : node.type === 'role' ? short(node.subtitle, 30) : `${labels[node.type]} · ${statuses[node.status]}`,
    tag: `${statuses[node.status]}${node.affected ? ' · scenario affected' : ''}`,
    pos: [position[0] + 40, position[1] - minimumY + 40] as [number, number], size: [200, 90] as [number, number],
  }));
  const affected = [...included.values()].filter(item => item.node.affected);
  const scope = controlId ? 'Control detail: owner, system dependencies and requirements.' : 'Role overview: ownership, accountability and directly owned controls. Select a control to explore its systems.';
  const dependencies = controls.map(control => `${control.name}: ${control.systemIds.map(id => snapshot.office.systems.find(system => system.id === id)?.name ?? id).join(', ') || 'no system dependency modelled'}.`);
  const cards: ArchifySpecification['cards'] = [
    { dot: 'slate', title: controlId ? 'System ownership' : 'System dependencies', items: controlId
      ? controls.flatMap(control => control.systemIds.map(id => { const system = snapshot.office.systems.find(item => item.id === id); const owner = snapshot.roles.find(item => item.roleId === system?.roleId); return `${system?.name ?? id}: ${owner?.name ?? 'unknown responsibility'}; ${owner?.ownerId ? snapshot.people.find(person => person.id === owner.ownerId)?.name ?? 'unknown person' : 'no confirmed owner'}.`; }))
      : dependencies.length ? dependencies : ['No directly owned control is modelled for this responsibility. Its connected responsibilities and systems are shown.'] },
    { dot: affected.length ? 'amber' : 'emerald', title: 'Scope and evidence', items: [scope, `${snapshot.scenarioLabel}. Fictional planning records; relationships show authored reachability, not live system behaviour.`] },
  ];
  return {
    specification: {
      schema_version: 1, diagram_type: 'architecture',
      meta: { title: controlId ? `${short(controls[0]?.name ?? role.name, 38)}` : `${role.name} · responsibility map`, locale: 'en', quality_profile: 'showcase',
        legend: { mode: 'auto', entries: { external: { label: 'People' }, backend: { label: 'Responsibilities' }, cloud: { label: 'Systems' }, security: { label: 'Controls' }, database: { label: 'Requirements' } } },
        views: [{ id: 'current-responsibility', label: controlId ? 'Control detail' : 'Responsibility overview', focus: components.map(component => component.id), note: 'Statuses come from the current planning snapshot. Select a node to inspect its authored relationships.' }] },
      components, connections, cards,
    },
    nodeIds: Object.fromEntries([...included.keys()].map(id => [archifyId(id), id])), roleId, controlId,
    availableControlIds: availableControls.map(item => item.id), empty: focus === 'affected' && !affected.length, scope,
  };
}
