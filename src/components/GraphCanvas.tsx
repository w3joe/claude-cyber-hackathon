import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, ExternalLink, Focus, LoaderCircle, Maximize2, Network, ZoomIn, ZoomOut } from 'lucide-react';
import type { Category, Snapshot } from '../domain/types';
import { makeArchifyMap, selectionForMap } from '../domain/archify-map';
import type { ArchifySpecification } from '../domain/archify-map';
import './GraphCanvas.css';

export interface GraphCanvasProps {
  snapshot: Snapshot;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  highlightedNodeIds: string[];
  focus: 'all' | 'affected';
  category: 'all' | Category;
  /** Hop distance from the scenario origin (kept for callers; Archify reveals the affected set). */
  distances?: Map<string, number>;
  /** Changes whenever a scenario runs or is replayed; the map then spotlights the affected records. */
  rippleKey?: string;
}
interface DeliveredMap { html: string; receipt: Record<string, unknown>; specification: ArchifySpecification; sourceHash: string; url: string; }
interface ArchifyWindow extends Window {
  Archify?: {
    view: { zoomIn: () => void; zoomOut: () => void; reset: () => void; reveal: (ids: string[], options: Record<string, unknown>) => boolean };
    focus: { setMany: (ids: string[], options: Record<string, unknown>) => boolean; set: (id: string, options: Record<string, unknown>) => boolean; clear: (options: Record<string, unknown>) => void };
  };
}

function saveFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function GraphCanvas({ snapshot, selectedNodeId, onSelectNode, highlightedNodeIds, focus, category, rippleKey }: GraphCanvasProps) {
  const shell = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const selectRef = useRef(onSelectNode);
  const bridgeCleanup = useRef<(() => void) | null>(null);
  const [delivery, setDelivery] = useState<DeliveredMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rippling, setRippling] = useState(false);
  const lastRipple = useRef(rippleKey);
  const pendingRipple = useRef(false);
  const loadedSpecification = useRef('');
  const rippleTimer = useRef<number | undefined>(undefined);
  const scopeSelection = selectionForMap(selectedNodeId, highlightedNodeIds);
  const map = useMemo(() => makeArchifyMap(snapshot, scopeSelection, focus, category), [snapshot, scopeSelection, focus, category]);
  const specificationText = JSON.stringify(map.specification);
  selectRef.current = onSelectNode;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setDelivery(null);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/archify/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ specification: map.specification }), signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Archify could not validate this map.');
        if (!controller.signal.aborted) { setDelivery(body); setLoading(false); }
      } catch (reason) {
        if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'The map could not be rendered.'); setLoading(false); }
      }
    }, 80);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [specificationText]);

  useEffect(() => () => bridgeCleanup.current?.(), []);

  function connectViewer() {
    bridgeCleanup.current?.();
    const document = frame.current?.contentDocument;
    if (!document) return;
    // Read the renderer's semantic attributes without modifying the checked HTML.
    const activate = (event: Event) => {
      if (event.type === 'keydown' && !['Enter', ' '].includes((event as KeyboardEvent).key)) return;
      const target = event.target as Element | null;
      const node = target?.closest('[data-node-id]');
      const id = node?.getAttribute('data-node-id');
      if (id && map.nodeIds[id]) selectRef.current(map.nodeIds[id]);
    };
    document.addEventListener('click', activate);
    document.addEventListener('keydown', activate);
    bridgeCleanup.current = () => { document.removeEventListener('click', activate); document.removeEventListener('keydown', activate); };
    const runtime = (frame.current?.contentWindow as ArchifyWindow | null)?.Archify;
    applyHighlights();
    // Archify's semantic reveal deliberately uses mobile containment below 720px.
    // Use its manual zoom API for a legible embedded starting view, retaining native pan.
    const svg = document.querySelector<SVGSVGElement>('.diagram-container > svg');
    const label = svg?.querySelector('[data-node-label]');
    const sourceFont = Number(label?.getAttribute('font-size')) || 13;
    const baseScale = svg?.viewBox.baseVal.width ? svg.clientWidth / svg.viewBox.baseVal.width : 1;
    const targetScale = Math.min(3, Math.max(1, Math.ceil((12 / (sourceFont * baseScale)) * 4) / 4));
    if (runtime) {
      runtime.view.reset();
      for (let scale = 1; scale < targetScale; scale += 0.25) runtime.view.zoomIn();
    }
    loadedSpecification.current = specificationText;
    runRipple();
  }

  function applyHighlights() {
    const runtime = (frame.current?.contentWindow as ArchifyWindow | null)?.Archify;
    if (!runtime) return;
    const ids = Object.keys(map.nodeIds).filter(id => highlightedNodeIds.includes(map.nodeIds[id]));
    if (ids.length) runtime.focus.setMany(ids, { toggle: false, hideChip: true, updateUrl: false, mode: 'selection' });
    else runtime.focus.clear({ updateUrl: false, preserveView: true });
  }
  useEffect(() => { if (delivery) applyHighlights(); }, [highlightedNodeIds.join('|'), selectedNodeId, delivery]);

  // Spotlight every affected record in view when a scenario runs or is replayed, then restore the normal view.
  // The map re-renders after a scenario, so the spotlight waits until the new viewer has loaded.
  function runRipple() {
    const runtime = (frame.current?.contentWindow as ArchifyWindow | null)?.Archify;
    // Only spotlight once the viewer is showing the current scenario's map, not the previous one.
    if (!pendingRipple.current || !runtime || loadedSpecification.current !== specificationText) return;
    pendingRipple.current = false;
    const affected = Object.keys(map.nodeIds).filter(id => snapshot.nodes.find(node => node.id === map.nodeIds[id])?.affected);
    if (!affected.length) return;
    runtime.focus.setMany(affected, { toggle: false, hideChip: true, updateUrl: false, mode: 'selection' });
    setRippling(true);
    window.clearTimeout(rippleTimer.current);
    rippleTimer.current = window.setTimeout(() => { setRippling(false); applyHighlights(); }, 2600);
  }
  useEffect(() => {
    if (lastRipple.current === rippleKey) return;
    lastRipple.current = rippleKey;
    pendingRipple.current = true;
    runRipple();
  }, [rippleKey]);
  useEffect(() => () => window.clearTimeout(rippleTimer.current), []);

  const navigate = (action: 'zoomIn' | 'zoomOut' | 'reset') => (frame.current?.contentWindow as ArchifyWindow | null)?.Archify?.view[action]();

  const openViewer = () => {
    if (!delivery) return;
    window.open(delivery.url, '_blank', 'noopener,noreferrer');
  };
  const expand = async () => {
    if (document.fullscreenElement === shell.current) await document.exitFullscreen();
    else await shell.current?.requestFullscreen();
  };
  const highlightsInScope = highlightedNodeIds.filter(id => Object.values(map.nodeIds).includes(id)).length;
  const role = snapshot.office.roles.find(item => item.id === map.roleId);

  return (
    <div className={`graph-shell archify-shell${rippling ? ' is-rippling' : ''}`} ref={shell} aria-label="Archify responsibility map">
      <div className="archify-map-toolbar">
        <div className="archify-map-identity"><Network size={17} aria-hidden="true" /><span>Archify canvas</span></div>
        <div className="archify-map-actions">
          <button type="button" onClick={() => void expand().catch(() => openViewer())} aria-label="Expand Archify map" title="Expand map"><Maximize2 size={15} /></button>
          <button type="button" onClick={openViewer} disabled={!delivery} aria-label="Open full Archify viewer" title="Open full viewer"><ExternalLink size={15} /></button>
          <button type="button" onClick={() => saveFile(`mandate-${map.roleId}.architecture.json`, JSON.stringify(map.specification, null, 2) + '\n', 'application/json')} aria-label="Download editable Archify map" title="Download editable map"><Download size={15} /></button>
        </div>
      </div>
      <div className="archify-map-scope">
        <label>Responsibility<select aria-label="Map responsibility" value={map.roleId} onChange={event => onSelectNode(`r:${event.target.value}`)}>{snapshot.office.roles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>View<select aria-label="Map detail" value={map.controlId ?? 'overview'} onChange={event => onSelectNode(event.target.value === 'overview' ? `r:${map.roleId}` : `c:${event.target.value}`)}><option value="overview">Role overview</option>{map.availableControlIds.map(id => <option key={id} value={id}>{snapshot.office.controls.find(item => item.id === id)?.name}</option>)}</select></label>
      </div>
      <div className="archify-viewport">
        {delivery && !loading && <iframe ref={frame} src={`${delivery.url}?embed=1&theme=light`} title={`${role?.name ?? 'Office'} — interactive Archify map`} onLoad={connectViewer} className="archify-frame" />}
        {delivery && !loading && <div className="archify-navigation" aria-label="Archify map navigation"><button type="button" onClick={() => navigate('zoomOut')} aria-label="Zoom out"><ZoomOut size={15} /></button><button type="button" onClick={() => navigate('zoomIn')} aria-label="Zoom in"><ZoomIn size={15} /></button><button type="button" onClick={() => navigate('reset')} aria-label="Fit complete map"><Focus size={15} /><span>Fit map</span></button></div>}
        {loading && <div className="archify-map-state" role="status"><LoaderCircle className="archify-loading" size={25} aria-hidden="true" /><strong>Building the current responsibility map</strong><p>Archify is checking the relationships and layout.</p></div>}
        {error && <div className="archify-map-state archify-map-state--error" role="alert"><AlertCircle size={25} aria-hidden="true" /><strong>This map could not be validated</strong><p>{error}</p><small>The current scenario remains available in the findings and inspector.</small></div>}
      </div>
      <div className="archify-map-footer">
        <span>{delivery ? <CheckCircle2 size={12} aria-hidden="true" /> : <Network size={12} aria-hidden="true" />}{delivery ? 'Validated Archify map' : 'Archify architecture renderer'}</span>
        <span>{rippling ? 'Spotlighting records affected by this scenario' : map.empty ? 'No scenario-affected items in this view' : highlightsInScope ? `${highlightsInScope} answer items in this view` : 'Drag to explore · Open full viewer to search and trace'}</span>
      </div>
    </div>
  );
}
