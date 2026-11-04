import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Inspector, ReportPage } from './Panels';
import { answerQuestion } from '../domain/questions';
import { buildReportHtml, buildReportMarkdown } from '../domain/report';
import { createBaselinePlan, evaluateOffice } from '../domain/engine';
import { seedOffice } from '../domain/seed';

const snapshot = () => evaluateOffice(structuredClone(seedOffice), createBaselinePlan());
describe('ODRL rule presentation', () => {
  it('renders requirement rule cards with conditions, source quotes and coverage gaps', () => {
    const s = snapshot();
    const html = renderToStaticMarkup(<Inspector node={s.nodes.find(n => n.id === 'q:media-permissions')} snapshot={s} onSelectNode={() => {}} onRepair={() => {}} onDepart={() => {}}/>);
    expect(html).toContain('ODRL RULES');
    expect(html).toContain('24 months');
    expect(html).toContain('not evaluated');
    expect(html).toContain('Coverage gap: alignment');
    expect(html).toContain('No control mapped');
  });

  it('renders all modalities and the JSON-LD download in the report view', () => {
    const html = renderToStaticMarkup(<ReportPage snapshot={snapshot()}/>);
    for (const text of ['Must', 'May', 'Must not', 'Download ODRL JSON-LD', 'Exercise is optional', 'forbidden action']) expect(html).toContain(text);
  });

  it('includes rule rows in both report formats and escapes quoted policy text', () => {
    const s = snapshot();
    s.office.policyGraph.rules[0].source.quote = '<script>bad</script> | source';
    const html = buildReportHtml(s); const markdown = buildReportMarkdown(s);
    expect(html).toContain('<h2>ODRL rules</h2>');
    expect(markdown).toContain('## ODRL rules');
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(markdown).toContain('&lt;script&gt;bad&lt;/script&gt; \\| source');
    expect(html).not.toContain('<script>');
  });

  it('answers clause questions from rule gaps and highlights the requirement', () => {
    const answer = answerQuestion('Which clauses lack a control?', snapshot());
    expect(answer.title).toBe('Policy rule coverage');
    expect(answer.bullets.join(' ')).toContain('24 months');
    expect(answer.nodeIds).toContain('q:media-permissions');
    expect(answer.text).toContain('not evaluated');
  });
});
