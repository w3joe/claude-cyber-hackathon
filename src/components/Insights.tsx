import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Command, CornerDownLeft, Radar, Search, ShieldAlert, Zap } from 'lucide-react';
import type { KeyPersonRisk } from '../domain/insights';

/** Animates a number towards its target so changes are felt, not just shown. */
export function useAnimatedNumber(target: number, duration = 700) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const initial = from.current;
    let frame = 0;
    const tick = (time: number) => {
      const t = Math.min(1, (time - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = initial + (target - initial) * eased;
      from.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return Math.round(value);
}

const scoreTone = (score: number) => score >= 85 ? 'good' : score >= 65 ? 'warn' : 'bad';

export function ResilienceGauge({ score, baseline }: { score: number; baseline: number }) {
  const shown = useAnimatedNumber(score);
  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  const delta = score - baseline;
  return <div className={`gauge gauge--${scoreTone(score)}`} title="Weighted health of roles (40%), controls (30%) and requirements (30%). A planning indicator, not a compliance rating.">
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={radius} className="gauge__track"/>
      <circle cx="32" cy="32" r={radius} className="gauge__value" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - shown / 100)}/>
    </svg>
    <div className="gauge__number"><strong>{shown}</strong></div>
    <div className="gauge__label"><small>RESILIENCE</small><span>{delta === 0 ? 'Baseline level' : <><b className={delta < 0 ? 'down' : 'up'}>{delta > 0 ? '+' : ''}{delta}</b> vs baseline</>}</span></div>
  </div>;
}

export function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  const shown = useAnimatedNumber(value, 500);
  return <div className={`stat ${tone && value ? `stat--${tone}` : ''}`}><strong>{shown}</strong><span>{label}</span></div>;
}

export function KeyPersonPanel({ risks, activePersonId, onSimulate }: { risks: KeyPersonRisk[]; activePersonId?: string; onSimulate: (personId: string) => void }) {
  const max = Math.max(1, ...risks.map(r => r.drop));
  const spofs = risks.filter(r => r.singlePointOfFailure).length;
  return <div className="risk-panel">
    <div className="risk-intro">
      <span className="ask-symbol"><Radar size={19}/></span>
      <h2>Key-person stress test</h2>
      <p>Every colleague's departure was simulated against the office. Ranked by resilience lost.</p>
      <div className="risk-summary"><span><b>{risks.length}</b> departures simulated</span><span className={spofs ? 'is-alert' : ''}><ShieldAlert size={13}/><b>{spofs}</b> single points of failure</span></div>
    </div>
    <ol className="risk-list">
      {risks.map((risk, index) => <li key={risk.personId}>
        <button className={`risk-row ${activePersonId === risk.personId ? 'is-active' : ''}`} onClick={() => onSimulate(risk.personId)} style={{ ['--i' as string]: index }}>
          <span className="risk-rank">{String(index + 1).padStart(2, '0')}</span>
          <span className="risk-body">
            <span className="risk-name"><strong>{risk.name}</strong>{risk.singlePointOfFailure && <em title="A vacated role has no recorded deputy">SPOF</em>}</span>
            <small>{risk.exposedRoles.length ? risk.exposedRoles.join(' · ') : risk.title}</small>
            <span className="risk-bar"><span style={{ width: `${(risk.drop / max) * 100}%` }} className={`risk-bar__fill risk-bar__fill--${scoreTone(100 - risk.drop * 2)}`}/></span>
          </span>
          <span className="risk-drop"><strong>{risk.drop ? `−${risk.drop}` : '0'}</strong><small>{risk.affected} affected</small></span>
          <span className="risk-go"><Zap size={14}/></span>
        </button>
      </li>)}
    </ol>
    <p className="ask-footnote">Select a person to play their departure on the map.</p>
  </div>;
}

export interface PaletteAction { id: string; group: string; label: string; hint?: string; icon?: React.ReactNode; run: () => void }

export function CommandPalette({ actions, onClose }: { actions: PaletteAction[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return actions.filter(a => terms.every(t => `${a.group} ${a.label} ${a.hint ?? ''}`.toLowerCase().includes(t))).slice(0, 40);
  }, [actions, query]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => { list.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' }); }, [active]);
  const run = (action?: PaletteAction) => { if (!action) return; onClose(); action.run(); };
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
    else if (e.key === 'Escape') onClose();
  }
  let lastGroup = '';
  return <div className="palette-backdrop" onMouseDown={onClose}>
    <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={e => e.stopPropagation()}>
      <div className="palette-search"><Search size={18}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey} placeholder="Simulate a departure, jump to a record, ask a question…" aria-label="Search commands"/><kbd>esc</kbd></div>
      <div className="palette-list" ref={list} role="listbox">
        {results.length ? results.map((action, index) => {
          const header = action.group !== lastGroup ? (lastGroup = action.group) : null;
          return <div key={action.id}>
            {header && <div className="palette-group">{header}</div>}
            <button role="option" aria-selected={index === active} className={`palette-item ${index === active ? 'is-active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => run(action)}>
              <span className="palette-icon">{action.icon ?? <ArrowRight size={15}/>}</span>
              <span className="palette-label">{action.label}{action.hint && <small>{action.hint}</small>}</span>
              {index === active && <CornerDownLeft size={14} className="palette-enter"/>}
            </button>
          </div>;
        }) : <div className="palette-empty">No matching commands.</div>}
      </div>
      <div className="palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> run</span><span className="palette-brand"><Command size={12}/>K anywhere</span></div>
    </div>
  </div>;
}
