import { useId } from "react";
import katex from "katex";
import type { z } from "zod";
import type { graphPanelSchema, LectureDocument } from "@/lib/lecture-schema";
import { niceTicks, sampleExpression } from "@/lib/plot-math";

type Visual = NonNullable<LectureDocument["sections"][number]["visual"]>;
type Panel = z.infer<typeof graphPanelSchema>;
const W = 680, H = 400;
const P = { left: 65, right: 35, top: 26, bottom: 55 };
const COLORS = ["#af452c", "#28677d", "#537436", "#8056a0", "#9c6b10", "#455c65"];

function MathLabel({ text }: { text: string }) {
  // Handle explicit math spans; recognize common bare equation labels from older results.
  const bare = /(?:^|:\s*)((?:[ysf](?:\([xt]\))?|dy\/dx)\s*=\s*.+)$/.exec(text);
  const normalized = !text.includes("$") && bare ? text.slice(0,text.length-bare[1].length)+`$${bare[1]}$` : text;
  return <>{normalized.split(/(\$[^$]+\$)/g).map((part,i)=>{
    if (!part.startsWith("$") || !part.endsWith("$")) return <span key={i}>{part}</span>;
    const latex=part.slice(1,-1).replace(/(?<!\\)\b(sin|cos|tan|exp|log)\b/g,"\\$1").replace(/\bdy\/dx\b/g,"\\frac{dy}{dx}");
    try { return <span key={i} dangerouslySetInnerHTML={{__html:katex.renderToString(latex,{throwOnError:true,trust:false})}}/>; }
    catch { return <span key={i}>{part.slice(1,-1)}</span>; }
  })}</>;
}

function GraphPanel({ panel }: { panel: Panel }) {
  const id = useId().replaceAll(":", "");
  const { xMin, xMax, yMin, yMax } = panel;
  if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || xMin >= xMax || yMin >= yMax) {
    return <p className="visual-warning">Cannot draw this graph: the extracted axis ranges are invalid. Compare with the source.</p>;
  }
  const x = (v: number) => P.left + (v-xMin)/(xMax-xMin)*(W-P.left-P.right);
  const y = (v: number) => H-P.bottom-(v-yMin)/(yMax-yMin)*(H-P.top-P.bottom);
  const xAxis = y(Math.max(yMin, Math.min(yMax, 0)));
  const yAxis = x(Math.max(xMin, Math.min(xMax, 0)));
  const xTicks = (panel.xTicks.length ? panel.xTicks : niceTicks(xMin,xMax)).filter(t=>t.value>=xMin&&t.value<=xMax);
  const yTicks = (panel.yTicks.length ? panel.yTicks : niceTicks(yMin,yMax)).filter(t=>t.value>=yMin&&t.value<=yMax);
  const failed: string[] = [];
  const series = panel.series.map(s => {
    try { return { ...s, segments: s.expression ? sampleExpression(s.expression, xMin,xMax,yMin,yMax) : [s.points] }; }
    catch { failed.push(s.label); return { ...s, segments: [] }; }
  });
  const path = (points: Array<{x:number;y:number}>) => points.map((p,i)=>`${i ? "L" : "M"}${x(p.x)},${y(p.y)}`).join(" ");
  return <section className="graph-panel">
    <h4><MathLabel text={panel.title}/></h4>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={panel.title}>
      <defs>
        <clipPath id={`${id}-clip`}><rect x={P.left} y={P.top} width={W-P.left-P.right} height={H-P.top-P.bottom}/></clipPath>
        <marker id={`${id}-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#637069" stroke="none"/></marker>
      </defs>
      {xTicks.map((t,i)=><g key={`x-${i}`}><line x1={x(t.value)} x2={x(t.value)} y1={P.top} y2={H-P.bottom} className="visual-grid"/><text x={x(t.value)} y={H-P.bottom+22} textAnchor="middle" className="visual-tick">{t.label}</text></g>)}
      {yTicks.map((t,i)=><g key={`y-${i}`}><line x1={P.left} x2={W-P.right} y1={y(t.value)} y2={y(t.value)} className="visual-grid"/><text x={P.left-12} y={y(t.value)+4} textAnchor="end" className="visual-tick">{t.label}</text></g>)}
      <line x1={P.left} x2={W-P.right} y1={xAxis} y2={xAxis} className="visual-axis"/>
      <line x1={yAxis} x2={yAxis} y1={P.top} y2={H-P.bottom} className="visual-axis"/>
      <g clipPath={`url(#${id}-clip)`}>
        {series.map((s,i)=><g key={i}>{s.segments.map((points,j)=>s.style === "points"
          ? <g key={j}>{points.map((p,k)=><circle key={k} cx={x(p.x)} cy={y(p.y)} r="4" fill={COLORS[i%COLORS.length]} stroke="none"/>)}</g>
          : <path key={j} d={path(points)} fill="none" stroke={COLORS[i%COLORS.length]} strokeWidth="2.8" strokeDasharray={s.style === "dashed" ? "8 6" : undefined}/>)}</g>)}
        {panel.annotations.map((a,i)=>{
          if (!a.points.length) return null;
          return <g key={i}>
            {a.kind === "point" ? <circle cx={x(a.points[0].x)} cy={y(a.points[0].y)} r="4" fill="#243b30"/> : a.kind !== "label" ?
              <path d={path(a.points)+(a.kind === "polygon" ? " Z" : "")} stroke="#637069" strokeWidth="1.8" fill={a.kind === "polygon" ? "#63706915" : "none"} strokeDasharray={a.dashed ? "6 5" : undefined} markerEnd={a.kind === "arrow" ? `url(#${id}-arrow)` : undefined}/> : null}
          </g>;
        })}
      </g>
      {panel.annotations.map((a,i)=>{
        const at = a.labelPosition ?? a.points[0];
        return at && a.label ? <text key={i} x={x(at.x)} y={y(at.y)-8} textAnchor="middle" className="plot-annotation">{a.label}</text> : null;
      })}
      <text x={(P.left+W-P.right)/2} y={H-10} textAnchor="middle" className="visual-axis-label">{panel.xLabel}</text>
      <text x="17" y={H/2} transform={`rotate(-90 17 ${H/2})`} textAnchor="middle" className="visual-axis-label">{panel.yLabel}</text>
    </svg>
    <div className="plot-legend">{panel.series.map((s,i)=><span key={i}><i style={{background:COLORS[i%COLORS.length]}}/><MathLabel text={s.label}/></span>)}</div>
    {failed.length > 0 && <p className="visual-warning">Formula could not be plotted: {failed.join(", ")}. No substitute curve was invented.</p>}
  </section>;
}

function wrap(text: string, width = 23): string[] {
  const words = text.split(/\s+/).flatMap(word => word.match(/.{1,23}/g) ?? []);
  const lines: string[] = []; let line = "";
  for (const word of words) { if ((line+" "+word).length > width && line) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word; }
  if (line) lines.push(line); return lines;
}

function ConceptDiagram({ visual }: { visual: Visual }) {
  const marker = useId().replaceAll(":", "");
  const height = Math.max(380, visual.nodes.length * 62);
  const nodes = visual.nodes.map(n=>({ ...n, lines: wrap(n.label), px:105+Math.max(0,Math.min(100,n.x))*4.7, py:80+Math.max(0,Math.min(100,n.y))*(height-160)/100 }));
  const positions = new Map(nodes.map(n=>[n.id,n]));
  const edgePoint = (from:typeof nodes[number], to:typeof nodes[number]) => {
    const dx=to.px-from.px, dy=to.py-from.py;
    const factor = Math.min(94/Math.max(Math.abs(dx),0.01), Math.max(30,from.lines.length*8+12)/Math.max(Math.abs(dy),0.01));
    return { x:from.px+dx*factor, y:from.py+dy*factor };
  };
  return <svg viewBox={`0 0 680 ${height}`} role="img" aria-label={visual.title}>
    <defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3Z" className="visual-arrowhead"/></marker></defs>
    {visual.edges.map((e,i)=>{ const from=positions.get(e.from), to=positions.get(e.to); if(!from||!to)return null; const a=edgePoint(from,to), b=edgePoint(to,from);
      return <g key={i}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="diagram-edge" markerEnd={`url(#${marker})`}/>{e.label && <text x={(a.x+b.x)/2} y={(a.y+b.y)/2-10} textAnchor="middle" className="diagram-edge-label">{e.label}</text>}</g>;
    })}
    {nodes.map(n=><g key={n.id}><rect x={n.px-94} y={n.py-Math.max(30,n.lines.length*8+12)} width="188" height={Math.max(60,n.lines.length*16+24)} rx="9" className="diagram-node"/>
      <text x={n.px} textAnchor="middle" className="diagram-node-label">{n.lines.map((line,i)=><tspan key={i} x={n.px} y={n.py-(n.lines.length-1)*8+i*16+4}>{line}</tspan>)}</text>
    </g>)}
  </svg>;
}

function Cell({ text }: { text: string }) {
  return <>{text.split(/(\$[^$]+\$)/g).map((part,i)=>part.startsWith("$")&&part.endsWith("$")
    ? <span key={i} dangerouslySetInnerHTML={{__html:katex.renderToString(part.slice(1,-1),{throwOnError:false,trust:false})}}/>
    : <span key={i}>{part}</span>)}</>;
}

export function LectureVisual({ visual }: { visual: Visual }) {
  const hasGraph = visual.kind === "coordinate_graph" && visual.panels?.length > 0;
  const hasDiagram = visual.kind === "concept_diagram" && visual.nodes.length > 0;
  const hasTable = visual.kind === "table" && visual.table && visual.table.columns.length > 0;
  if (!hasGraph && !hasDiagram && !hasTable) return <p className="visual-warning">The visual could not be reconstructed reliably. {visual.description}</p>;
  return <figure className="lecture-visual">
    <div className="visual-heading"><span>Interpreted from the lecture</span><strong><MathLabel text={visual.title}/></strong></div>
    <div className="visual-canvas">
      {hasGraph ? visual.panels.map((panel,i)=><GraphPanel key={i} panel={panel}/>) : hasDiagram ? <ConceptDiagram visual={visual}/> :
        <table className="lecture-table"><thead><tr>{visual.table!.columns.map((c,i)=><th key={i}><Cell text={c}/></th>)}</tr></thead>
          <tbody>{visual.table!.rows.map((row,i)=><tr key={i}>{visual.table!.columns.map((_,j)=><td key={j}><Cell text={row[j]??"—"}/></td>)}</tr>)}</tbody></table>}
    </div>
    <figcaption>{visual.description}<small>{visual.fidelity === "formula_based" && hasGraph ? "Curves calculated from the extracted formula; source interpretation still needs checking." : "Reconstructed from source interpretation; compare details with the board."}</small></figcaption>
    {visual.uncertainty && <p className="visual-warning">{visual.uncertainty}</p>}
  </figure>;
}
