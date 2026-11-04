import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Check, ChevronRight, Command, FileText, GitBranch, Layers3,
  MessageSquare, Network, Play, Radar, RotateCcw, Search, ShieldCheck, Undo2, UserMinus, UserPlus, X,
} from 'lucide-react';
import GraphCanvas from './components/GraphCanvas';
import { ScenarioDialog, RepairDialog } from './components/Dialogs';
import { AskPanel, Inspector, RepairsPage, ReportPage } from './components/Panels';
import { CommandPalette, KeyPersonPanel, ResilienceGauge, Stat, type PaletteAction } from './components/Insights';
import { download, now, uid } from './components/ui';
import { seedOffice } from './domain/seed';
import { createBaselinePlan, evaluateOffice } from './domain/engine';
import { impactDistances, keyPersonRisks, resilienceScore } from './domain/insights';
import { loadPlan, parsePlan, savePlan } from './domain/storage';
import type { Category, Plan, Repair, RoleImpact, Scenario } from './domain/types';

type Page = 'canvas' | 'repairs' | 'report';
type Tab = 'inspect' | 'ask' | 'risk';
const PAGE_TITLES: Record<Page, string> = { canvas: 'Impact canvas', repairs: 'Repair plan', report: 'Evidence report' };
const PROMPTS = ['What happens if the head of media leaves?', 'Who can take over?', 'What requirements are affected?', 'What evidence is missing?'];

export default function App() {
  const initial = useMemo(() => loadPlan(), []);
  const [plan, setPlan] = useState<Plan>(initial.plan || createBaselinePlan());
  const [page, setPage] = useState<Page>('canvas');
  const [tab, setTab] = useState<Tab>('risk');
  const [compare, setCompare] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [focus, setFocus] = useState<'all' | 'affected'>('all');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [scenarioKind, setScenarioKind] = useState<'leave' | 'join' | 'move' | null>(null);
  const [repairRole, setRepairRole] = useState<RoleImpact | null>(null);
  const [notification, setNotification] = useState(initial.error || '');
  const [saveError, setSaveError] = useState('');
  const [history, setHistory] = useState<Plan[]>([]);
  const [palette, setPalette] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);
  const [traced, setTraced] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const live = useMemo(() => evaluateOffice(seedOffice, plan), [plan]);
  const baseline = useMemo(() => evaluateOffice(seedOffice, createBaselinePlan()), []);
  const risks = useMemo(() => keyPersonRisks(seedOffice), []);
  const snapshot = compare && page === 'canvas' ? baseline : live;
  const score = useMemo(() => resilienceScore(snapshot).score, [snapshot]);
  const baselineScore = useMemo(() => resilienceScore(baseline).score, [baseline]);
  const distances = useMemo(() => impactDistances(snapshot), [snapshot]);
  const selectedNode = snapshot.nodes.find(n => n.id === selected);
  const changed = plan.scenario.kind !== 'baseline' || plan.repairs.length > 0;
  const openRoles = live.roles.filter(r => !['covered', 'verified'].includes(r.status)).length;
  const attention = snapshot.requirements.filter(r => ['unknown', 'at-risk', 'unowned', 'proposed'].includes(r.status)).length;

  useEffect(() => { setSaveError(savePlan(plan)); }, [plan]);
  useEffect(() => { if (!notification) return; const t = setTimeout(() => setNotification(''), 6000); return () => clearTimeout(t); }, [notification]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function updatePlan(next: Plan) { setHistory(old => [...old.slice(-9), plan]); setPlan(next); setCompare(false); setHighlighted([]); }
  function applyScenario(scenario: Scenario) {
    updatePlan({ schemaVersion: 1, scenario, repairs: [] });
    setScenarioKind(null); setPage('canvas'); setFocus('all'); setCategory('all'); setTraced(false); setReplay(r => r + 1);
    setSelected(scenario.personId ? `p:${scenario.personId}` : scenario.targetRoleId ? `r:${scenario.targetRoleId}` : null);
    setNotification('Scenario running. Watch the impact ripple through the map.');
  }
  const simulateLeave = (personId: string) => applyScenario({ id: uid(), kind: 'leave', personId, createdAt: now() });
  const selectNode = useCallback((id: string) => {
    setSelected(id); setHighlighted([]); setTab('inspect'); setPage('canvas');
    if (live.nodes.find(n => n.id === id)?.affected) setTraced(true);
  }, [live]);
  function openRepair(role: RoleImpact, candidateId?: string) {
    if (compare) { setNotification('Switch back to the scenario to record a repair.'); return; }
    setRepairRole(candidateId ? { ...role, repair: { id: role.repair?.id || uid(), roleId: role.roleId, candidateId, status: 'proposed', authorisedById: '', ownerAccepted: false, authorityConfirmed: false, accessConfirmed: false, evidence: '', createdAt: now() } } : role);
  }
  function saveRepair(repair: Repair) {
    updatePlan({ ...plan, repairs: [...plan.repairs.filter(r => r.roleId !== repair.roleId), repair] });
    setRepairRole(null);
    setNotification(repair.status === 'confirmed' ? 'Handover verified. Resilience recalculated.' : 'Handover proposed. Not yet verified.');
  }
  function resetBaseline() { updatePlan(createBaselinePlan()); setFocus('all'); setSelected(null); setNotification('Original office restored. Undo is available.'); }
  function undo() { const previous = history.at(-1); if (!previous) return; setHistory(history.slice(0, -1)); setPlan(previous); setCompare(false); setHighlighted([]); setNotification('Previous plan restored.'); }
  async function importPlan(file?: File) {
    if (!file) return;
    try { if (file.size > 500_000) throw new Error('Choose a plan smaller than 500 KB.'); updatePlan(parsePlan(await file.text())); setNotification('Plan imported. Recorded checks remain user-provided assertions.'); }
    catch (e) { setNotification(e instanceof Error ? e.message : 'Could not read this plan.'); }
    if (fileInput.current) fileInput.current.value = '';
  }
  function ask(question: string) { setPage('canvas'); setTab('ask'); setPendingQuestion(question); }

  const loop = [
    { label: 'Explore a change', done: plan.scenario.kind !== 'baseline', run: () => { setPage('canvas'); setTab('risk'); } },
    { label: 'Trace the impact', done: traced, run: () => { const first = live.nodes.find(n => n.affected && n.type === 'role'); if (first) selectNode(first.id); else setScenarioKind('leave'); } },
    { label: 'Plan the handover', done: plan.repairs.length > 0, run: () => setPage('repairs') },
    { label: 'Record the evidence', done: plan.repairs.some(r => r.status === 'confirmed'), run: () => setPage('report') },
  ];
  const progress = loop.filter(s => s.done).length;
  const nextStep = loop.findIndex(s => !s.done);

  const actions = useMemo<PaletteAction[]>(() => [
    ...seedOffice.people.filter(p => p.active).map(p => ({ id: `leave-${p.id}`, group: 'Simulate', label: `${p.name} leaves`, hint: p.title, icon: <UserMinus size={15}/>, run: () => simulateLeave(p.id) })),
    { id: 'join', group: 'Simulate', label: 'Someone joins…', icon: <UserPlus size={15}/>, run: () => setScenarioKind('join') },
    { id: 'move', group: 'Simulate', label: 'Someone changes role…', icon: <GitBranch size={15}/>, run: () => setScenarioKind('move') },
    { id: 'risk', group: 'Analyse', label: 'Open key-person stress test', icon: <Radar size={15}/>, run: () => { setPage('canvas'); setTab('risk'); } },
    ...(changed ? [
      { id: 'replay', group: 'Analyse', label: 'Replay impact ripple', icon: <Play size={15}/>, run: () => { setPage('canvas'); setReplay(r => r + 1); } },
      { id: 'compare', group: 'Analyse', label: compare ? 'Back to scenario' : 'Compare with baseline', icon: <Layers3 size={15}/>, run: () => { setPage('canvas'); setCompare(c => !c); } },
      { id: 'reset', group: 'Analyse', label: 'Reset to original office', icon: <RotateCcw size={15}/>, run: resetBaseline },
    ] : []),
    ...PROMPTS.map(q => ({ id: `ask-${q}`, group: 'Ask the map', label: q, icon: <MessageSquare size={15}/>, run: () => ask(q) })),
    ...(['canvas', 'repairs', 'report'] as Page[]).map(p => ({ id: `go-${p}`, group: 'Go to', label: PAGE_TITLES[p], icon: <ChevronRight size={15}/>, run: () => { setPage(p); setCompare(false); } })),
    ...live.nodes.map(n => ({ id: `node-${n.id}`, group: 'Records', label: n.label, hint: `${n.type} · ${n.subtitle}`, icon: <Search size={15}/>, run: () => selectNode(n.id) })),
  ], [live, changed, compare, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="app-shell">
    <aside className="sidebar">
      <a href="#" onClick={e => { e.preventDefault(); setPage('canvas'); }} className="brand">
        <span className="brand-mark"><Network size={20}/></span>
        <span>mandate<small>GRC IMPACT STUDIO</small></span>
      </a>
      <div className="office-card"><span className="office-avatar">N</span><span><strong>Northstar Studio</strong><small>7 people · fictional office</small></span></div>
      <nav aria-label="Main navigation">
        {(['canvas', 'repairs', 'report'] as Page[]).map(p => {
          const Icon = p === 'canvas' ? Network : p === 'repairs' ? GitBranch : FileText;
          return <button key={p} className={page === p ? 'active' : ''} onClick={() => { setPage(p); setCompare(false); }}>
            <Icon size={17}/><span>{PAGE_TITLES[p]}</span>{p === 'repairs' && openRoles > 0 && <span className="nav-count">{openRoles}</span>}
          </button>;
        })}
      </nav>
      <div className="loop">
        <div className="loop-head"><span className="section-label">THE CHANGE LOOP</span><span className="loop-count">{progress}/4</span></div>
        <div className="loop-bar"><span style={{ width: `${progress * 25}%` }}/></div>
        {loop.map((step, i) => <button key={step.label} className={`loop-step ${step.done ? 'is-done' : ''} ${i === nextStep ? 'is-next' : ''}`} onClick={step.run}>
          <span className="loop-index">{step.done ? <Check size={12} strokeWidth={3}/> : `0${i + 1}`}</span>{step.label}{i === nextStep && <ChevronRight size={14} className="loop-arrow"/>}
        </button>)}
      </div>
      <div className="sidebar-bottom"><span className="local-indicator"/><span>Local planning workspace<small>No company systems connected</small></span></div>
    </aside>

    <div className="app-main">
      <header className="topbar">
        <div className="breadcrumb">Northstar<ChevronRight size={13}/><strong>{PAGE_TITLES[page]}</strong></div>
        <button className="search-pill" onClick={() => setPalette(true)}><Search size={15}/><span>Search or simulate…</span><kbd><Command size={11}/>K</kbd></button>
        <div className="top-actions">
          <span className={`save-state ${saveError ? 'save-failed' : ''}`}><span/>{saveError ? 'Not saved' : 'Saved locally'}</span>
          <button className="icon-button" onClick={undo} disabled={!history.length} title="Undo last change" aria-label="Undo last change"><Undo2 size={17}/></button>
          <button className="icon-button" onClick={() => fileInput.current?.click()} title="Import plan" aria-label="Import plan"><ArrowUpFromLine size={17}/></button>
          <button className="icon-button" onClick={() => download(JSON.stringify(plan, null, 2), 'mandate-plan.json', 'application/json')} title="Save plan file" aria-label="Save plan file"><ArrowDownToLine size={17}/></button>
          <button className="button primary" onClick={() => { setPage('report'); setCompare(false); }}><FileText size={15}/><span>Report</span></button>
          <input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" aria-label="Import plan file" onChange={e => importPlan(e.target.files?.[0])}/>
        </div>
      </header>

      <div className="workspace-content">
        <section className={`deck ${changed ? 'is-changed' : ''}`}>
          <div className="deck-scenario">
            <span className={`scenario-dot ${changed ? 'changed' : ''}`}/>
            <div><small>{compare ? 'VIEWING BASELINE' : changed ? 'ACTIVE SCENARIO' : 'STARTING POINT'}</small><strong>{compare ? 'Baseline office' : live.scenarioLabel}</strong></div>
            {changed && <button className="icon-button small" aria-label="Clear scenario" title="Reset to original office" onClick={resetBaseline}><X size={15}/></button>}
          </div>
          <ResilienceGauge score={score} baseline={baselineScore}/>
          <div className="deck-stats">
            <Stat value={snapshot.summary.affected} label="affected" tone="warn"/>
            <Stat value={snapshot.summary.unowned} label="unowned roles" tone="bad"/>
            <Stat value={snapshot.summary.proposed} label="proposed" tone="violet"/>
            <Stat value={snapshot.summary.verified} label="verified" tone="good"/>
            <Stat value={attention} label="reqs at risk" tone="warn"/>
          </div>
          <div className="scenario-buttons">
            <button onClick={() => setScenarioKind('leave')}><UserMinus size={15}/>Leaves</button>
            <button onClick={() => setScenarioKind('join')}><UserPlus size={15}/>Joins</button>
            <button onClick={() => setScenarioKind('move')}><GitBranch size={15}/>Moves</button>
          </div>
        </section>
        {saveError && <div className="notice warning" role="alert">{saveError} Export a plan to keep your work.</div>}

        {page === 'canvas' ? <div className="canvas-layout">
          <section className="canvas-panel" aria-label="Organisation graph">
            <div className="canvas-toolbar">
              <div className="lens-controls" aria-label="GRC lens">
                {(['all', 'governance', 'risk', 'compliance'] as const).map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c === 'all' ? 'Whole map' : c[0].toUpperCase() + c.slice(1)}</button>)}
              </div>
              <div className="canvas-view-controls">
                <label className="toggle"><input type="checkbox" checked={focus === 'affected'} onChange={e => setFocus(e.target.checked ? 'affected' : 'all')}/><span className="toggle-track"/>Affected only</label>
                {changed && !compare && <button className="chip-button" onClick={() => setReplay(r => r + 1)}><Play size={13}/>Replay ripple</button>}
                {changed && <button className={`chip-button ${compare ? 'active' : ''}`} onClick={() => { setCompare(!compare); setHighlighted([]); }}><Layers3 size={14}/>{compare ? 'Back to scenario' : 'Compare baseline'}</button>}
              </div>
            </div>
            {compare && <div className="baseline-banner"><ArrowLeft size={14}/>Original office. Your scenario and handovers are preserved.</div>}
            <GraphCanvas snapshot={snapshot} selectedNodeId={selected} onSelectNode={selectNode} highlightedNodeIds={highlighted} focus={compare ? 'all' : focus} category={category} distances={compare ? new Map() : distances} rippleKey={`${plan.scenario.id}-${replay}`}/>
          </section>
          <aside className="detail-panel">
            <div className="panel-tabs" role="tablist" aria-label="Canvas details">
              <button role="tab" aria-selected={tab === 'risk'} className={tab === 'risk' ? 'active' : ''} onClick={() => setTab('risk')}><Radar size={14}/>Stress test</button>
              <button role="tab" aria-selected={tab === 'inspect'} className={tab === 'inspect' ? 'active' : ''} onClick={() => setTab('inspect')}><Search size={14}/>Inspect</button>
              <button role="tab" aria-selected={tab === 'ask'} className={tab === 'ask' ? 'active' : ''} onClick={() => setTab('ask')}><MessageSquare size={14}/>Ask</button>
            </div>
            {tab === 'risk' ? <KeyPersonPanel risks={risks} activePersonId={plan.scenario.kind === 'leave' ? plan.scenario.personId : undefined} onSimulate={simulateLeave}/>
              : tab === 'inspect' ? <Inspector node={selectedNode} snapshot={snapshot} onSelectNode={selectNode} onRepair={openRepair} onDepart={simulateLeave}/>
                : <AskPanel snapshot={snapshot} pendingQuestion={pendingQuestion} onConsumeQuestion={() => setPendingQuestion(null)} onHighlight={ids => { setHighlighted(ids); setSelected(null); setFocus('all'); setTraced(true); }} onScenario={applyScenario}/>}
          </aside>
        </div>
          : page === 'repairs' ? <RepairsPage snapshot={live} onRepair={openRepair} onSelectNode={id => { setCompare(false); selectNode(id); }}/>
            : <ReportPage snapshot={live}/>}
      </div>
      <footer className="app-footer"><span><ShieldCheck size={12}/>Statuses describe this plan, not a compliance certificate.</span><span>{live.findings.filter(f => !['covered', 'verified', 'inactive'].includes(f.status)).length} open findings · Repairs stay proposed until confirmed</span></footer>
    </div>

    {scenarioKind && <ScenarioDialog kind={scenarioKind} onClose={() => setScenarioKind(null)} onApply={applyScenario}/>}
    {repairRole && <RepairDialog key={`${repairRole.roleId}-${repairRole.repair?.candidateId || ''}`} role={repairRole} snapshot={live} onSave={saveRepair} onClose={() => setRepairRole(null)}/>}
    {palette && <CommandPalette actions={actions} onClose={() => setPalette(false)}/>}
    {notification && <div className="toast" role="status"><Check size={16}/><span>{notification}</span><button onClick={() => setNotification('')} aria-label="Dismiss notification"><X size={15}/></button></div>}
  </div>;
}
