import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Check, ChevronRight, FileText, GitBranch, Layers3, MessageSquare, Network, Search, ShieldCheck, Undo2, UserMinus, UserPlus, X } from 'lucide-react';
import GraphCanvas from './components/GraphCanvas';
import { ScenarioDialog, RepairDialog } from './components/Dialogs';
import { AskPanel, Inspector, RepairsPage, ReportPage } from './components/Panels';
import { download, now, uid } from './components/ui';
import { seedOffice } from './domain/seed';
import { createBaselinePlan, evaluateOffice } from './domain/engine';
import { loadPlan, parsePlan, savePlan } from './domain/storage';
import type { Category, Plan, Repair, RoleImpact, Scenario } from './domain/types';

export default function App() {
  const initial = useMemo(() => loadPlan(), []);
  const [plan,setPlan] = useState<Plan>(initial.plan || createBaselinePlan());
  const [page,setPage] = useState<'canvas'|'repairs'|'report'>('canvas');
  const [tab,setTab] = useState<'inspect'|'ask'>('ask');
  const [compare,setCompare] = useState(false);
  const [selected,setSelected] = useState<string|null>('r:head-media');
  const [highlighted,setHighlighted] = useState<string[]>([]);
  const [focus,setFocus] = useState<'all'|'affected'>('all');
  const [category,setCategory] = useState<'all'|Category>('all');
  const [scenarioKind,setScenarioKind] = useState<'leave'|'join'|'move'|null>(null);
  const [repairRole,setRepairRole] = useState<RoleImpact|null>(null);
  const [notification,setNotification] = useState(initial.error || '');
  const [saveError,setSaveError] = useState('');
  const [history,setHistory] = useState<Plan[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const live = useMemo(() => evaluateOffice(seedOffice,plan),[plan]);
  const baseline = useMemo(() => evaluateOffice(seedOffice,createBaselinePlan()),[]);
  const snapshot = compare && page==='canvas' ? baseline : live;
  const selectedNode = snapshot.nodes.find(n => n.id===selected);
  const changed = plan.scenario.kind!=='baseline' || plan.repairs.length>0;
  useEffect(()=>{setSaveError(savePlan(plan));},[plan]);
  useEffect(()=>{if(!notification)return;const timer=setTimeout(()=>setNotification(''),7000);return()=>clearTimeout(timer);},[notification]);
  function updatePlan(next:Plan) { setHistory(old=>[...old.slice(-9),plan]);setPlan(next);setCompare(false);setHighlighted([]); }
  function applyScenario(scenario:Scenario) { updatePlan({schemaVersion:1,scenario,repairs:[]});setScenarioKind(null);setPage('canvas');setFocus('affected');setCategory('all');setSelected(scenario.personId?`p:${scenario.personId}`:scenario.targetRoleId?`r:${scenario.targetRoleId}`:null);setNotification('Scenario created. The original office is preserved for comparison.'); }
  function selectNode(id:string) {setSelected(id);setHighlighted([]);setTab('inspect');setPage('canvas');}
  function openRepair(role:RoleImpact,candidateId?:string) {if(compare){setNotification('Switch back to the scenario to record a repair.');return;}setRepairRole(candidateId?{...role,repair:{id:role.repair?.id||uid(),roleId:role.roleId,candidateId,status:'proposed',authorisedById:'',ownerAccepted:false,authorityConfirmed:false,accessConfirmed:false,evidence:'',createdAt:now()}}:role);}
  function saveRepair(repair:Repair) {updatePlan({...plan,repairs:[...plan.repairs.filter(r=>r.roleId!==repair.roleId),repair]});setRepairRole(null);setNotification(repair.status==='confirmed'?'Handover checks recorded. Separate evidence gaps remain visible.':'Handover proposed. The responsibility is not yet verified.');}
  function undo() {const previous=history.at(-1);if(!previous)return;setHistory(history.slice(0,-1));setPlan(previous);setCompare(false);setHighlighted([]);setNotification('Previous plan restored.');}
  async function importPlan(file?:File) {if(!file)return;try{if(file.size>500_000)throw new Error('Choose a plan smaller than 500 KB.');updatePlan(parsePlan(await file.text()));setNotification('Plan imported. Recorded checks remain user-provided assertions.');}catch(e){setNotification(e instanceof Error?e.message:'Could not read this plan.');}if(fileInput.current)fileInput.current.value='';}
  const openFindings=live.findings.filter(f=>!['covered','verified','inactive'].includes(f.status)).length;
  return <div className="app-shell">
    <aside className="sidebar"><a href="#" onClick={e=>{e.preventDefault();setPage('canvas');}} className="brand"><span className="brand-mark"><Network size={24}/></span><span>mandate<small>GRC IMPACT STUDIO</small></span></a><div className="workspace-label">WORKSPACE</div><div className="office-card"><span className="office-avatar">N</span><span><strong>Northstar Studio</strong><small>Fictional small office</small></span></div>
      <nav aria-label="Main navigation"><button className={page==='canvas'?'active':''} onClick={()=>setPage('canvas')}><Network size={19}/><span>Impact canvas</span><ChevronRight size={14}/></button><button className={page==='repairs'?'active':''} onClick={()=>{setPage('repairs');setCompare(false);}}><GitBranch size={19}/><span>Repair plan</span><span className="nav-count">{live.roles.filter(r=>!['covered','verified'].includes(r.status)).length}</span></button><button className={page==='report'?'active':''} onClick={()=>{setPage('report');setCompare(false);}}><FileText size={19}/><span>Evidence report</span></button></nav>
      <div className="sidebar-guide"><span className="section-label">THE CHANGE LOOP</span><div><span>01</span>Explore a change</div><div><span>02</span>Trace the impact</div><div><span>03</span>Plan the handover</div><div><span>04</span>Record the evidence</div></div><div className="sidebar-bottom"><span className="local-indicator"/><span>Local planning workspace<small>No company systems connected</small></span></div>
    </aside>
    <div className="app-main"><header className="topbar"><div className="breadcrumb">Workspace<ChevronRight size={13}/><strong>{page==='canvas'?'Impact canvas':page==='repairs'?'Repair plan':'Evidence report'}</strong></div><div className="top-actions"><span className={`save-state ${saveError?'save-failed':''}`}><span/>{saveError?'Not saved':'Saved on this device'}</span><button className="icon-button" onClick={undo} disabled={!history.length} title="Undo last change" aria-label="Undo last change"><Undo2 size={18}/></button><button className="button subtle" onClick={()=>fileInput.current?.click()}><ArrowUpFromLine size={15}/><span>Import</span></button><button className="button subtle" onClick={()=>download(JSON.stringify(plan,null,2),'mandate-plan.json','application/json')}><ArrowDownToLine size={15}/><span>Save plan</span></button><button className="button primary" onClick={()=>{setPage('report');setCompare(false);}}><FileText size={16}/><span>Report</span></button><input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" aria-label="Import plan file" onChange={e=>importPlan(e.target.files?.[0])}/></div></header>
      <div className="workspace-content"><div className="workspace-heading"><div><span className="eyebrow">PEOPLE CHANGE. RESPONSIBILITY REMAINS.</span><h1>{page==='canvas'?'See what the change touches.':page==='repairs'?'Keep the next step clear.':'Show the work behind the claim.'}</h1></div><span className="sample-badge">FICTIONAL OFFICE · MVP</span></div>
        <div className="scenario-bar"><div className="scenario-current"><span className={`scenario-dot ${changed?'changed':''}`}/><div><small>{changed?'ACTIVE SCENARIO':'STARTING POINT'}</small><strong>{live.scenarioLabel}</strong></div></div><div className="scenario-buttons"><button onClick={()=>setScenarioKind('leave')}><UserMinus size={16}/>Someone leaves</button><button onClick={()=>setScenarioKind('join')}><UserPlus size={16}/>Someone joins</button><button onClick={()=>setScenarioKind('move')}><GitBranch size={16}/>Role changes</button>{changed&&<button className="clear-scenario" aria-label="Clear scenario" onClick={()=>{updatePlan(createBaselinePlan());setFocus('all');setNotification('Original office restored. Undo is available.');}}><X size={16}/></button>}</div></div>
        <div className="impact-strip"><div><strong>{snapshot.summary.affected}</strong><span>affected records</span></div><div><strong>{snapshot.summary.unowned}</strong><span>roles without an owner</span></div><div><strong>{snapshot.summary.proposed}</strong><span>proposed handovers</span></div><div><strong>{snapshot.summary.verified}</strong><span>verified handovers</span></div><span className="impact-strip-note"><Activity size={14}/>{snapshot.requirements.filter(r=>['unknown','at-risk','unowned','proposed'].includes(r.status)).length} requirements need attention</span></div>
        {saveError&&<div className="notice warning" role="alert">{saveError} Export a plan to keep your work.</div>}
        {page==='canvas'?<div className="canvas-layout"><section className="canvas-panel" aria-label="Organisation graph"><div className="canvas-toolbar"><div className="lens-controls" aria-label="GRC lens">{(['all','governance','risk','compliance']as const).map(c=><button key={c} className={category===c?'active':''} onClick={()=>setCategory(c)}>{c==='all'?'Whole map':c[0].toUpperCase()+c.slice(1)}</button>)}</div><div className="canvas-view-controls"><label className="toggle-label"><input type="checkbox" checked={focus==='affected'} onChange={e=>setFocus(e.target.checked?'affected':'all')}/>Affected only</label>{changed&&<button className={`compare-button ${compare?'active':''}`} onClick={()=>{setCompare(!compare);setHighlighted([]);}}><Layers3 size={15}/>{compare?'Back to scenario':'Compare baseline'}</button>}</div></div>{compare&&<div className="baseline-banner"><ArrowLeft size={14}/>Original office. Your scenario and handovers are preserved.</div>}
          <GraphCanvas snapshot={snapshot} selectedNodeId={selected} onSelectNode={selectNode} highlightedNodeIds={highlighted} focus={compare?'all':focus} category={category}/>
          <div className="canvas-bottom"><span><ShieldCheck size={13}/>Statuses describe this plan, not a compliance certificate.</span><span>{snapshot.people.length} people · {seedOffice.roles.length} roles</span></div></section><aside className="detail-panel"><div className="panel-tabs" role="tablist" aria-label="Canvas details"><button role="tab" aria-selected={tab==='inspect'} className={tab==='inspect'?'active':''} onClick={()=>setTab('inspect')}><Search size={15}/>Inspect</button><button role="tab" aria-selected={tab==='ask'} className={tab==='ask'?'active':''} onClick={()=>setTab('ask')}><MessageSquare size={15}/>Ask the map</button></div>{tab==='inspect'?<Inspector node={selectedNode} snapshot={snapshot} onSelectNode={selectNode} onRepair={openRepair} onDepart={personId=>applyScenario({id:uid(),kind:'leave',personId,createdAt:now()})}/>:<AskPanel snapshot={snapshot} onHighlight={ids=>{setHighlighted(ids);setSelected(null);setFocus('all');}} onScenario={applyScenario}/>}</aside></div>:page==='repairs'?<RepairsPage snapshot={live} onRepair={openRepair} onSelectNode={id=>{setCompare(false);selectNode(id);}}/>:<ReportPage snapshot={live}/>}
      </div><footer className="app-footer"><span>Mandate / People, authority and evidence.</span><span>{openFindings} open findings · Repairs stay proposed until confirmed.</span></footer>
    </div>
    {scenarioKind&&<ScenarioDialog kind={scenarioKind} onClose={()=>setScenarioKind(null)} onApply={applyScenario}/>}
    {repairRole&&<RepairDialog key={`${repairRole.roleId}-${repairRole.repair?.candidateId||''}`} role={repairRole} snapshot={live} onSave={saveRepair} onClose={()=>setRepairRole(null)}/>}
    {notification&&<div className="toast" role="status"><Check size={17}/><span>{notification}</span><button onClick={()=>setNotification('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
  </div>;
}
