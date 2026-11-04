import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Handle, MarkerType, MiniMap, Panel, Position,
  ReactFlow, ReactFlowProvider, applyNodeChanges, useNodesInitialized, useReactFlow, useViewport,
} from '@xyflow/react';
import type { Edge, Node, NodeChange, NodeProps, NodeTypes, XYPosition } from '@xyflow/react';
import {
  AlertCircle, ArrowRight, BriefcaseBusiness, Check, FileCheck2, Focus, GitBranch,
  Maximize2, MonitorCog, RotateCcw, ShieldCheck, UserRound, ZoomIn, ZoomOut,
} from 'lucide-react';
import type { Category, EntityType, GraphNode, Snapshot, Status } from '../domain/types';
import '@xyflow/react/dist/style.css';
import './GraphCanvas.css';

export interface GraphCanvasProps {
  snapshot: Snapshot;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  highlightedNodeIds: string[];
  focus: 'all' | 'affected';
  category: 'all' | Category;
}

export type GraphCardData = {
  entity: GraphNode;
  dimmed: boolean;
  highlighted: boolean;
};
export type ResponsibilityNode = Node<GraphCardData, 'entity'>;

const LABELS: Record<EntityType, string> = {
  person: 'Person', role: 'Responsibility', system: 'System', control: 'Control', requirement: 'Requirement',
};
const STATUS_LABELS: Record<Status, string> = {
  covered: 'Covered', 'at-risk': 'At risk', unowned: 'Unowned', proposed: 'Proposed',
  verified: 'Verified', unknown: 'Unknown', inactive: 'Inactive',
};
const ICONS = { person: UserRound, role: BriefcaseBusiness, system: MonitorCog, control: ShieldCheck, requirement: FileCheck2 };
const STATUS_COLOURS: Record<Status, string> = {
  covered: '#59766a', 'at-risk': '#b77923', unowned: '#bf5549', proposed: '#7665b4',
  verified: '#338068', unknown: '#887e69', inactive: '#8a9390',
};
const CARD_WIDTH = 192;
const ROW = 154;
const COLUMN = { person: 0, role: 248, system: 248, control: 514, requirement: 780 };

const EntityCard = memo(function EntityCard({ data, selected }: NodeProps<ResponsibilityNode>) {
  const { entity, dimmed, highlighted } = data;
  const Icon = ICONS[entity.type];
  return (
    <div className={`graph-card graph-card--${entity.type} graph-card--${entity.status}${entity.affected ? ' is-affected' : ''}${dimmed ? ' is-dimmed' : ''}${selected ? ' is-selected' : ''}${highlighted ? ' is-highlighted' : ''}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="graph-card__eyebrow">
        <span className="graph-card__type"><Icon size={14} strokeWidth={1.7} aria-hidden="true" />{LABELS[entity.type]}</span>
        {entity.affected && <span className="graph-card__affected" title="Affected by this scenario"><AlertCircle size={13} aria-hidden="true" /><span className="graph-sr-only">Affected by this scenario</span></span>}
      </div>
      <div className="graph-card__name" title={entity.label}>{entity.label}</div>
      <div className="graph-card__subtitle" title={entity.subtitle}>{entity.subtitle || entity.description}</div>
      <div className={`graph-card__status graph-card__status--${entity.status}`}>
        {entity.status === 'verified' ? <Check size={11} strokeWidth={2.5} aria-hidden="true" /> : <span className="graph-card__status-dot" />}
        {STATUS_LABELS[entity.status]}
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
});

const NODE_TYPES: NodeTypes = { entity: EntityCard };

function relatedIds(ids: Iterable<string>, snapshot: Snapshot): Set<string> {
  const seeds = new Set(ids);
  const related = new Set(seeds);
  snapshot.edges.forEach(edge => {
    if (seeds.has(edge.source) || seeds.has(edge.target)) {
      related.add(edge.source);
      related.add(edge.target);
    }
  });
  return related;
}

function traceIds(ids: Iterable<string>, snapshot: Snapshot): Set<string> {
  const seeds = [...ids];
  const result = new Set(seeds);
  for (const direction of ['upstream', 'downstream'] as const) {
    const visited = new Set(seeds);
    const pending = [...seeds];
    while (pending.length) {
      const id = pending.pop()!;
      snapshot.edges.forEach(edge => {
        const matches = direction === 'upstream' ? edge.target === id : edge.source === id;
        const next = direction === 'upstream' ? edge.source : edge.target;
        if (matches && !visited.has(next)) {
          visited.add(next);
          result.add(next);
          pending.push(next);
        }
      });
    }
  }
  return result;
}

/** Supporting context stays visible, but only the domain marks an item as affected. */
function visibleIds(snapshot: Snapshot, focus: GraphCanvasProps['focus'], category: GraphCanvasProps['category']): Set<string> {
  const all = new Set(snapshot.nodes.map(node => node.id));
  let result = all;
  if (category !== 'all') {
    const controls = snapshot.office.controls.filter(control => control.category === category);
    const entityIds = {
      control: new Set(controls.map(control => control.id)),
      role: new Set(controls.map(control => control.roleId)),
      system: new Set(controls.flatMap(control => control.systemIds)),
      requirement: new Set(controls.flatMap(control => control.requirementIds)),
    };
    result = new Set(snapshot.nodes.filter(node => node.type !== 'person' && entityIds[node.type].has(node.entityId)).map(node => node.id));
    const nodeMap = new Map(snapshot.nodes.map(node => [node.id, node]));
    let added = true;
    while (added) {
      added = false;
      snapshot.edges.forEach(edge => {
        const source = nodeMap.get(edge.source);
        if (result.has(edge.target) && source && (source.type === 'person' || source.type === 'role') && !result.has(source.id)) {
          result.add(source.id);
          added = true;
        }
      });
    }
  }
  if (focus === 'affected') {
    const context = relatedIds(snapshot.nodes.filter(node => node.affected).map(node => node.id), snapshot);
    result = new Set([...result].filter(id => context.has(id)));
  }
  return result;
}

function buildLayout(snapshot: Snapshot): Map<string, XYPosition> {
  const positions = new Map<string, XYPosition>();
  const byEntity = (type: EntityType, id: string) => snapshot.nodes.find(node => node.type === type && node.entityId === id);
  const orderedRoles = [...snapshot.office.roles].sort((a, b) => Number(/media|creative|production|content/i.test(b.name)) - Number(/media|creative|production|content/i.test(a.name)));
  let laneY = 40;
  for (const role of orderedRoles) {
    const controls = snapshot.office.controls.filter(control => control.roleId === role.id);
    const systems = snapshot.office.systems.filter(system => system.roleId === role.id);
    const roleNode = byEntity('role', role.id);
    if (roleNode) positions.set(roleNode.id, { x: COLUMN.role, y: laneY });
    systems.forEach((system, index) => {
      const node = byEntity('system', system.id);
      if (node) positions.set(node.id, { x: COLUMN.system, y: laneY + (index + 1) * ROW });
    });
    controls.forEach((control, index) => {
      const node = byEntity('control', control.id);
      if (node) positions.set(node.id, { x: COLUMN.control, y: laneY + index * ROW });
    });
    laneY += Math.max(controls.length, systems.length + 1, 1) * ROW + 62;
  }

  // Order shared people and requirements by their earliest responsibility, keeping the first workflow together.
  for (const type of ['person', 'requirement'] as const) {
    const items = snapshot.nodes.filter(node => node.type === type).map(node => {
      const connectedPositions = snapshot.edges
        .filter(edge => edge.source === node.id || edge.target === node.id)
        .map(edge => positions.get(edge.source === node.id ? edge.target : edge.source))
        .filter((position): position is XYPosition => Boolean(position));
      return { node, desiredY: connectedPositions.length ? Math.min(...connectedPositions.map(position => position.y)) : laneY };
    }).sort((a, b) => a.desiredY - b.desiredY);
    let previousY = -ROW;
    items.forEach(({ node, desiredY }) => {
      const y = Math.max(desiredY, previousY + ROW);
      positions.set(node.id, { x: COLUMN[type], y });
      previousY = y;
    });
  }
  snapshot.nodes.forEach((node, index) => {
    if (!positions.has(node.id)) positions.set(node.id, { x: COLUMN[node.type], y: laneY + index * ROW });
  });
  return positions;
}

function initialWorkflowIds(snapshot: Snapshot): string[] {
  const role = snapshot.office.roles.find(item => /media|creative|production|content/i.test(item.name)) ?? snapshot.office.roles[0];
  if (!role) return snapshot.nodes.map(node => node.id);
  const controlIds = new Set(snapshot.office.controls.filter(control => control.roleId === role.id).map(control => control.id));
  const seeds = snapshot.nodes.filter(node => (node.type === 'role' && node.entityId === role.id) || (node.type === 'control' && controlIds.has(node.entityId)));
  const related = relatedIds(seeds.map(node => node.id), snapshot);
  return snapshot.nodes.filter(node => {
    if (!related.has(node.id)) return false;
    if (node.type === 'role') return node.entityId === role.id;
    if (node.type === 'system') return snapshot.office.systems.some(system => system.id === node.entityId && system.roleId === role.id);
    return true;
  }).map(node => node.id);
}

function GraphCanvasInner({ snapshot, selectedNodeId, onSelectNode, highlightedNodeIds, focus, category }: GraphCanvasProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const flow = useReactFlow<ResponsibilityNode, Edge>();
  const initialized = useNodesInitialized();
  const { zoom } = useViewport();
  const [nodes, setNodes] = useState<ResponsibilityNode[]>([]);
  const [fullScreen, setFullScreen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const fittedKey = useRef('');
  const layout = useMemo(() => buildLayout(snapshot), [snapshot]);
  const visible = useMemo(() => visibleIds(snapshot, focus, category), [snapshot, focus, category]);
  const highlightsKey = [...highlightedNodeIds].sort().join('|');
  const highlightSet = useMemo(() => new Set(highlightedNodeIds), [highlightsKey]);
  const context = useMemo(() => {
    const seeds = highlightSet.size ? highlightSet : selectedNodeId ? new Set([selectedNodeId]) : null;
    return seeds ? traceIds(seeds, snapshot) : null;
  }, [snapshot, selectedNodeId, highlightSet]);
  const visibilityKey = `${focus}:${category}:${[...visible].sort().join('|')}`;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(query.matches);
    const update = () => setReduceMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const update = () => setFullScreen(document.fullscreenElement === shellRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    setNodes(previous => {
      const positions = new Map(previous.map(node => [node.id, node.position]));
      return snapshot.nodes.map(entity => ({
        id: entity.id, type: 'entity',
        position: positions.get(entity.id) ?? layout.get(entity.id) ?? { x: 0, y: 0 },
        data: { entity, dimmed: Boolean(context && !context.has(entity.id)), highlighted: highlightSet.has(entity.id) },
        hidden: !visible.has(entity.id), selected: selectedNodeId === entity.id,
        width: CARD_WIDTH, deletable: false, connectable: false, focusable: true,
        ariaLabel: `${LABELS[entity.type]}: ${entity.label}. ${STATUS_LABELS[entity.status]}.${entity.affected ? ' Affected by this scenario.' : ''} Select to inspect.`,
      }));
    });
  }, [snapshot, layout, visible, context, highlightSet, selectedNodeId]);

  const edges = useMemo<Edge[]>(() => {
    const nodeMap = new Map(snapshot.nodes.map(node => [node.id, node]));
    return snapshot.edges.map(edge => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      const relevant = !context || (context.has(edge.source) && context.has(edge.target));
      const endpointStatuses = [source?.status, target?.status];
      const status: Status = endpointStatuses.includes('unowned') ? 'unowned'
        : endpointStatuses.includes('proposed') ? 'proposed'
          : endpointStatuses.includes('verified') && endpointStatuses.every(item => item === 'verified' || item === 'covered') ? 'verified' : 'at-risk';
      const colour = edge.affected ? STATUS_COLOURS[status ?? 'at-risk'] : relevant && context ? '#6d8e7e' : '#b3c0b6';
      return {
        id: edge.id, source: edge.source, target: edge.target, type: 'smoothstep',
        label: edge.label, hidden: !visible.has(edge.source) || !visible.has(edge.target),
        animated: false, selectable: false, focusable: false, deletable: false,
        style: { stroke: colour, strokeWidth: edge.affected ? 2.1 : 1.35, opacity: relevant ? 1 : 0.18 },
        labelStyle: { fill: edge.affected ? '#73502b' : '#63756b', fontSize: 10.5, fontWeight: 500, opacity: relevant ? 1 : 0.25 },
        labelShowBg: true, labelBgStyle: { fill: '#f7f8f5', fillOpacity: 0.96 },
        labelBgPadding: [5, 3], labelBgBorderRadius: 4,
        markerEnd: { type: MarkerType.ArrowClosed, color: colour, width: 13, height: 13 },
        ariaLabel: `${source?.label ?? edge.source} ${edge.label} ${target?.label ?? edge.target}`,
      };
    });
  }, [snapshot, visible, context]);

  const fitNodes = useCallback((ids?: string[], duration = 220) => {
    const requested = ids?.filter(id => visible.has(id));
    void flow.fitView({ nodes: requested?.length ? requested.map(id => ({ id })) : undefined, padding: 0.08, maxZoom: 1, minZoom: 0.16, duration: reduceMotion ? 0 : duration });
  }, [flow, visible, reduceMotion]);

  useEffect(() => {
    if (!initialized || !visible.size || fittedKey.current === visibilityKey) return;
    const firstFit = !fittedKey.current;
    fittedKey.current = visibilityKey;
    const ids = firstFit && focus === 'all' && category === 'all' ? initialWorkflowIds(snapshot) : undefined;
    const frame = requestAnimationFrame(() => fitNodes(ids, 0));
    return () => cancelAnimationFrame(frame);
  }, [initialized, visibilityKey, visible.size, focus, category, snapshot, fitNodes]);

  useEffect(() => {
    if (!initialized || !highlightSet.size) return;
    const frame = requestAnimationFrame(() => fitNodes([...highlightSet]));
    return () => cancelAnimationFrame(frame);
  }, [highlightsKey, initialized]);

  const onNodesChange = useCallback((changes: NodeChange<ResponsibilityNode>[]) => {
    setNodes(current => applyNodeChanges(changes, current));
    const selection = changes.find(change => change.type === 'select' && change.selected);
    if (selection && selection.type === 'select') onSelectNode(selection.id);
  }, [onSelectNode]);

  const resetLayout = () => {
    setNodes(current => current.map(node => ({ ...node, position: layout.get(node.id) ?? node.position })));
    requestAnimationFrame(() => fitNodes());
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === shellRef.current) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch { /* Some embedded browsers disable fullscreen; the map remains usable. */ }
  };
  const visibleAffected = snapshot.nodes.filter(node => visible.has(node.id) && node.affected).length;

  return (
    <div className={`graph-shell${fullScreen ? ' is-fullscreen' : ''}`} ref={shellRef} aria-label="Interactive responsibility and risk map">
      <ReactFlow<ResponsibilityNode, Edge>
        nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} onNodesChange={onNodesChange}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        nodesConnectable={false} edgesReconnectable={false} edgesFocusable={false}
        deleteKeyCode={null} multiSelectionKeyCode={null} selectionOnDrag={false}
        minZoom={0.16} maxZoom={1.6} defaultViewport={{ x: 30, y: 75, zoom: 0.7 }}
        zoomOnDoubleClick={false} panOnDrag preventScrolling proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#dce3d9" />
        <Panel position="top-left" className="graph-map-caption">
          <div className="graph-map-caption__title"><GitBranch size={15} aria-hidden="true" /><span>Responsibility map</span><span className="graph-map-caption__count">{visible.size} items</span></div>
          <div className="graph-map-caption__flow">People <ArrowRight size={11} aria-hidden="true" /> Responsibilities <ArrowRight size={11} aria-hidden="true" /> Controls <ArrowRight size={11} aria-hidden="true" /> Requirements</div>
        </Panel>
        <Panel position="top-right" className="graph-map-tools">
          <button type="button" className="graph-tool" onClick={() => fitNodes()} title="Fit all visible connections" aria-label="Fit all visible connections"><Focus size={16} /><span>Fit map</span></button>
          <button type="button" className="graph-tool graph-tool--icon" onClick={toggleFullscreen} title={fullScreen ? 'Exit full screen' : 'Expand map'} aria-label={fullScreen ? 'Exit full screen' : 'Expand map'}><Maximize2 size={16} /></button>
        </Panel>
        <Panel position="bottom-left" className="graph-bottom-controls">
          <div className="graph-zoom-controls" aria-label="Map navigation">
            <button type="button" onClick={() => void flow.zoomOut({ duration: reduceMotion ? 0 : 160 })} aria-label="Zoom out" title="Zoom out"><ZoomOut size={16} /></button>
            <span aria-label={`Zoom ${Math.round(zoom * 100)} per cent`}>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => void flow.zoomIn({ duration: reduceMotion ? 0 : 160 })} aria-label="Zoom in" title="Zoom in"><ZoomIn size={16} /></button>
            <span className="graph-control-divider" />
            <button type="button" onClick={resetLayout} aria-label="Reset map layout" title="Reset map layout"><RotateCcw size={15} /></button>
          </div>
          <span className="graph-navigation-hint">Drag to explore · Select an item to inspect</span>
        </Panel>
        <MiniMap pannable zoomable position="bottom-right" className="graph-minimap" nodeColor={node => STATUS_COLOURS[(node.data as GraphCardData).entity.status]} nodeStrokeWidth={0} nodeBorderRadius={3} maskColor="rgba(236, 241, 232, .78)" ariaLabel="Map overview. Drag to navigate." />
      </ReactFlow>
      {!visible.size && <div className="graph-empty-state" role="status"><GitBranch size={28} strokeWidth={1.4} aria-hidden="true" /><strong>{focus === 'affected' ? 'No affected connections in this view' : 'No connections in this category'}</strong><p>Change the focus or category filter to explore more of the map.</p></div>}
      <div className="graph-legend" aria-label="Map legend">
        <span><i className="graph-legend__dot graph-legend__dot--affected" />{visibleAffected ? `${visibleAffected} affected` : 'Affected by a scenario'}</span>
        <span><i className="graph-legend__dot graph-legend__dot--unowned" />Unowned</span>
        <span><i className="graph-legend__dot graph-legend__dot--proposed" />Proposed</span>
        <span><i className="graph-legend__dot graph-legend__dot--verified" />Verified</span>
        <span className="graph-legend__note">Systems sit beneath their responsible role</span>
      </div>
    </div>
  );
}

export default function GraphCanvas(props: GraphCanvasProps) {
  return <ReactFlowProvider><GraphCanvasInner {...props} /></ReactFlowProvider>;
}
