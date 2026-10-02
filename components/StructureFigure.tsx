import { useId, type ReactNode } from "react";
import type { StructureSpec } from "@/lib/notes/figure";

/**
 * Data structures drawn from their description, never from hand coordinates: every array, list,
 * stack, queue, tree, graph and hash table gets the same clean, readable layout.
 */

const INK = "#1d2622", MUTED = "#6c7670", PAPER = "#fffdf8", HIGHLIGHT = "#eaf6cf", HIGHLIGHT_STROKE = "#5d8a1f";
const FONT = 17;

type Box = { x: number; y: number; w: number; h: number };

function Value({ x, y, text, size = FONT, color = INK, anchor = "middle", weight }: { x: number; y: number; text: string; size?: number; color?: string; anchor?: "start" | "middle" | "end"; weight?: number }) {
  return <text x={x} y={y} textAnchor={anchor} dominantBaseline="central" fontSize={size} fill={color} fontWeight={weight} className="structure-text">{text}</text>;
}

function Cell({ box, label, highlight }: { box: Box; label: string; highlight?: boolean }) {
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={4} fill={highlight ? HIGHLIGHT : PAPER} stroke={highlight ? HIGHLIGHT_STROKE : INK} strokeWidth={1.8} />
      <Value x={box.x + box.w / 2} y={box.y + box.h / 2} text={label} />
    </g>
  );
}

/** A labeled pointer (head, top, i…) that points down at a target point. */
function Pointer({ x, y, label, marker }: { x: number; y: number; label: string; marker: string }) {
  return (
    <g>
      <Value x={x} y={y - 34} text={label} size={14} color={HIGHLIGHT_STROKE} weight={700} />
      <line x1={x} y1={y - 24} x2={x} y2={y - 4} stroke={HIGHLIGHT_STROKE} strokeWidth={1.8} markerEnd={`url(#${marker}-green)`} />
    </g>
  );
}

function Frame({ width, height, label, children }: { width: number; height: number; label: string; children: (marker: string) => ReactNode }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox={`0 0 ${Math.max(120, width)} ${Math.max(60, height)}`} className="redraw-svg structure-svg" role="img" aria-label={label}>
      <defs>
        <marker id={`${id}-ink`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={INK} /></marker>
        <marker id={`${id}-green`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={HIGHLIGHT_STROKE} /></marker>
      </defs>
      {children(id)}
    </svg>
  );
}

/* ---------- array, queue, stack ---------- */

function Row({ spec }: { spec: StructureSpec }) {
  const cw = 58, ch = 50, x0 = 24, hasPointers = spec.pointers.length > 0 || spec.type === "queue";
  const y0 = hasPointers ? 56 : 16;
  const pointers = spec.pointers.length ? spec.pointers
    : spec.type === "queue" && spec.cells.length ? [{ label: "front", to: "0" }, { label: "rear", to: String(spec.cells.length - 1) }] : [];
  const at = (to: string) => {
    const byIndex = spec.cells.findIndex(c => c.index === to);
    const i = byIndex >= 0 ? byIndex : Number.isInteger(Number(to)) ? Number(to) : spec.cells.findIndex(c => c.label === to);
    return i >= 0 && i < spec.cells.length ? i : null;
  };
  const hasIndex = spec.cells.some(c => c.index !== "") || spec.type === "array";
  return (
    <Frame width={x0 * 2 + spec.cells.length * cw} height={y0 + ch + (hasIndex ? 34 : 16)} label={spec.type}>
      {marker => <>
        {spec.cells.map((cell, i) => (
          <g key={i}>
            <Cell box={{ x: x0 + i * cw, y: y0, w: cw, h: ch }} label={cell.label} highlight={cell.highlight} />
            {hasIndex && <Value x={x0 + i * cw + cw / 2} y={y0 + ch + 16} text={cell.index || String(i)} size={13} color={MUTED} />}
          </g>
        ))}
        {pointers.map((p, k) => { const i = at(p.to); return i === null ? null : <Pointer key={k} x={x0 + i * cw + cw / 2 + (pointers.filter((q, j) => j < k && at(q.to) === i).length * 14)} y={y0} label={p.label} marker={marker} />; })}
      </>}
    </Frame>
  );
}

function Stack({ spec }: { spec: StructureSpec }) {
  const cw = 110, ch = 42, x0 = 92, top = 20, n = spec.cells.length;
  const height = top + n * ch + 30;
  const y = (i: number) => top + (n - 1 - i) * ch + 8; // index 0 is the bottom
  const topLabel = spec.pointers.find(p => /top/i.test(p.label))?.label ?? "top";
  return (
    <Frame width={x0 + cw + 40} height={height} label="stack">
      {marker => <>
        <path d={`M${x0 - 6} ${top} V${top + n * ch + 14} H${x0 + cw + 6} V${top}`} fill="none" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
        {spec.cells.map((cell, i) => <Cell key={i} box={{ x: x0, y: y(i), w: cw, h: ch - 6 }} label={cell.label} highlight={cell.highlight} />)}
        {n > 0 && <g>
          <Value x={x0 - 70} y={y(n - 1) + (ch - 6) / 2} text={topLabel} size={14} color={HIGHLIGHT_STROKE} weight={700} anchor="start" />
          <line x1={x0 - 34} y1={y(n - 1) + (ch - 6) / 2} x2={x0 - 10} y2={y(n - 1) + (ch - 6) / 2} stroke={HIGHLIGHT_STROKE} strokeWidth={1.8} markerEnd={`url(#${marker}-green)`} />
        </g>}
      </>}
    </Frame>
  );
}

/* ---------- linked lists ---------- */

function orderChain(spec: StructureSpec): string[] {
  const next = new Map<string, string>();
  const incoming = new Set<string>();
  for (const e of spec.edges) { if (!next.has(e.from) && !(spec.type === "doubly-linked-list" && next.get(e.to) === e.from)) next.set(e.from, e.to); incoming.add(e.to); }
  const head = spec.pointers.find(p => /head|first|start/i.test(p.label))?.to;
  const start = (head && spec.nodes.some(n => n.id === head) ? head : spec.nodes.find(n => !incoming.has(n.id))?.id) ?? spec.nodes[0]?.id;
  const order: string[] = [];
  for (let id = start; id && !order.includes(id); id = next.get(id)!) order.push(id);
  for (const node of spec.nodes) if (!order.includes(node.id)) order.push(node.id);
  return order;
}

function LinkedList({ spec }: { spec: StructureSpec }) {
  const order = orderChain(spec);
  const doubly = spec.type === "doubly-linked-list";
  const vw = 54, pw = doubly ? 18 : 24, h = 46, gap = 46, x0 = doubly ? 46 : 24, hasPointers = spec.pointers.length > 0;
  const y0 = hasPointers ? 58 : 18;
  const nodeW = vw + pw * (doubly ? 2 : 1);
  const left = (i: number) => x0 + i * (nodeW + gap);
  const byId = new Map(spec.nodes.map(n => [n.id, n]));
  const width = left(order.length) + 30;
  return (
    <Frame width={width} height={y0 + h + 30} label={doubly ? "doubly linked list" : "linked list"}>
      {marker => <>
        {order.map((id, i) => {
          const node = byId.get(id)!;
          const x = left(i);
          const valueX = x + (doubly ? pw : 0);
          return (
            <g key={id}>
              <rect x={x} y={y0} width={nodeW} height={h} rx={5} fill={node.highlight ? HIGHLIGHT : PAPER} stroke={node.highlight ? HIGHLIGHT_STROKE : INK} strokeWidth={1.8} />
              {doubly && <line x1={x + pw} y1={y0} x2={x + pw} y2={y0 + h} stroke={INK} strokeWidth={1.4} />}
              <line x1={valueX + vw} y1={y0} x2={valueX + vw} y2={y0 + h} stroke={INK} strokeWidth={1.4} />
              <Value x={valueX + vw / 2} y={y0 + h / 2} text={node.label} />
              <circle cx={valueX + vw + pw / 2} cy={y0 + h / 2 - (doubly ? 8 : 0)} r={3} fill={INK} />
              {doubly && <circle cx={x + pw / 2} cy={y0 + h / 2 + 8} r={3} fill={INK} />}
              {i < order.length - 1
                ? <line x1={valueX + vw + pw / 2} y1={y0 + h / 2 - (doubly ? 8 : 0)} x2={left(i + 1) - 2} y2={y0 + h / 2 - (doubly ? 8 : 0)} stroke={INK} strokeWidth={1.8} markerEnd={`url(#${marker}-ink)`} />
                : <Value x={x + nodeW + 22} y={y0 + h / 2} text="∅" size={20} color={MUTED} />}
              {doubly && (i > 0
                ? <line x1={x + pw / 2} y1={y0 + h / 2 + 8} x2={left(i - 1) + nodeW + 2} y2={y0 + h / 2 + 8} stroke={INK} strokeWidth={1.8} markerEnd={`url(#${marker}-ink)`} />
                : <Value x={x - 22} y={y0 + h / 2} text="∅" size={20} color={MUTED} />)}
            </g>
          );
        })}
        {spec.pointers.map((p, k) => { const i = order.indexOf(p.to); return i < 0 ? null : <Pointer key={k} x={left(i) + (doubly ? pw : 0) + vw / 2 + (spec.pointers.filter((q, j) => j < k && q.to === p.to).length * 16)} y={y0} label={p.label} marker={marker} />; })}
      </>}
    </Frame>
  );
}

/* ---------- trees ---------- */

function Tree({ spec }: { spec: StructureSpec }) {
  const children = new Map<string, Array<{ id: string; side: "left" | "right" | "none" }>>();
  const hasParent = new Set<string>();
  for (const e of spec.edges) {
    if (hasParent.has(e.to)) continue;
    hasParent.add(e.to);
    children.set(e.from, [...(children.get(e.from) ?? []), { id: e.to, side: e.side }]);
  }
  const rootPointer = spec.pointers.find(p => /root/i.test(p.label))?.to;
  const root = (rootPointer && spec.nodes.some(n => n.id === rootPointer) ? rootPointer : spec.nodes.find(n => !hasParent.has(n.id))?.id) ?? spec.nodes[0]?.id;
  const binary = [...children.values()].every(list => list.length <= 2);
  const pos = new Map<string, { x: number; depth: number }>();
  let column = 0;
  const visit = (id: string, depth: number) => {
    if (pos.has(id)) return;
    const kids = children.get(id) ?? [];
    if (binary) {
      // In-order placement: left subtree, node, right subtree (a BST reads left to right in order).
      const leftKid = kids.find(k => k.side === "left") ?? (kids.length === 2 || (kids.length === 1 && kids[0].side !== "right") ? kids[0] : undefined);
      const rightKid = kids.find(k => k.side === "right") ?? (kids.length === 2 ? kids.find(k => k !== leftKid) : undefined);
      if (leftKid) visit(leftKid.id, depth + 1);
      else if (rightKid) column += 0.5;
      pos.set(id, { x: column++, depth });
      if (rightKid) visit(rightKid.id, depth + 1);
      else if (leftKid) column += 0.5;
    } else if (!kids.length) {
      pos.set(id, { x: column++, depth });
    } else {
      kids.forEach(k => visit(k.id, depth + 1));
      const xs = kids.map(k => pos.get(k.id)!.x);
      pos.set(id, { x: (Math.min(...xs) + Math.max(...xs)) / 2, depth });
    }
  };
  if (root) visit(root, 0);
  for (const node of spec.nodes) if (!pos.has(node.id)) visit(node.id, 0);
  const r = 22, unit = 54, level = 76, x0 = 36, y0 = spec.pointers.length ? 62 : 32;
  const X = (id: string) => x0 + pos.get(id)!.x * unit + r;
  const Y = (id: string) => y0 + pos.get(id)!.depth * level + r;
  const maxX = Math.max(0, ...[...pos.values()].map(p => p.x)), maxDepth = Math.max(0, ...[...pos.values()].map(p => p.depth));
  const byId = new Map(spec.nodes.map(n => [n.id, n]));
  return (
    <Frame width={x0 * 2 + maxX * unit + r * 2} height={y0 + maxDepth * level + r * 2 + 16} label="tree">
      {marker => <>
        {spec.edges.filter(e => pos.has(e.from) && pos.has(e.to)).map((e, i) => {
          const [x1, y1, x2, y2] = [X(e.from), Y(e.from), X(e.to), Y(e.to)];
          const len = Math.hypot(x2 - x1, y2 - y1) || 1;
          return <g key={i}>
            <line x1={x1 + (x2 - x1) * r / len} y1={y1 + (y2 - y1) * r / len} x2={x2 - (x2 - x1) * (r + 2) / len} y2={y2 - (y2 - y1) * (r + 2) / len} stroke={INK} strokeWidth={1.8} markerEnd={spec.directed ? `url(#${marker}-ink)` : undefined} />
            {e.label && <Value x={(x1 + x2) / 2 + 10} y={(y1 + y2) / 2 - 8} text={e.label} size={13} color={MUTED} />}
          </g>;
        })}
        {spec.nodes.filter(n => pos.has(n.id)).map(node => (
          <g key={node.id}>
            <circle cx={X(node.id)} cy={Y(node.id)} r={r} fill={node.highlight ? HIGHLIGHT : PAPER} stroke={node.highlight ? HIGHLIGHT_STROKE : INK} strokeWidth={1.8} />
            <Value x={X(node.id)} y={Y(node.id)} text={node.label} size={node.label.length > 3 ? 13 : FONT} />
          </g>
        ))}
        {spec.pointers.map((p, k) => byId.has(p.to) && pos.has(p.to) ? <Pointer key={k} x={X(p.to)} y={Y(p.to) - r} label={p.label} marker={marker} /> : null)}
      </>}
    </Frame>
  );
}

/* ---------- graphs ---------- */

function Graph({ spec }: { spec: StructureSpec }) {
  const n = spec.nodes.length, r = 22;
  const R = Math.max(70, n * 22), cx = R + 50, cy = R + 40;
  const at = new Map(spec.nodes.map((node, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
    return [node.id, { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) }];
  }));
  return (
    <Frame width={cx * 2} height={cy * 2} label="graph">
      {marker => <>
        {spec.edges.map((e, i) => {
          const a = at.get(e.from)!, b = at.get(e.to)!;
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
          const twin = spec.directed && spec.edges.some(o => o.from === e.to && o.to === e.from);
          const off = twin ? 5 : 0; // two directed edges between the same pair sit side by side
          return <g key={i}>
            <line x1={a.x + ux * r - uy * off} y1={a.y + uy * r + ux * off} x2={b.x - ux * (r + 2) - uy * off} y2={b.y - uy * (r + 2) + ux * off} stroke={INK} strokeWidth={1.8} markerEnd={spec.directed ? `url(#${marker}-ink)` : undefined} />
            {e.label && <g>
              <rect x={(a.x + b.x) / 2 - uy * (off + 10) - 13} y={(a.y + b.y) / 2 + ux * (off + 10) - 11} width={26} height={22} rx={5} fill={PAPER} />
              <Value x={(a.x + b.x) / 2 - uy * (off + 10)} y={(a.y + b.y) / 2 + ux * (off + 10)} text={e.label} size={14} color="#2a58a8" weight={700} />
            </g>}
          </g>;
        })}
        {spec.nodes.map(node => { const p = at.get(node.id)!; return (
          <g key={node.id}>
            <circle cx={p.x} cy={p.y} r={r} fill={node.highlight ? HIGHLIGHT : PAPER} stroke={node.highlight ? HIGHLIGHT_STROKE : INK} strokeWidth={1.8} />
            <Value x={p.x} y={p.y} text={node.label} size={node.label.length > 3 ? 13 : FONT} />
          </g>
        ); })}
      </>}
    </Frame>
  );
}

/* ---------- hash tables ---------- */

function HashTable({ spec }: { spec: StructureSpec }) {
  const bw = 44, bh = 40, iw = 58, gap = 34, x0 = 60, y0 = 16;
  const longest = Math.max(0, ...spec.buckets.map(b => b.items.length));
  return (
    <Frame width={x0 + bw + longest * (iw + gap) + 30} height={y0 * 2 + spec.buckets.length * bh} label="hash table">
      {marker => <>
        {spec.buckets.map((bucket, i) => {
          const y = y0 + i * bh;
          return (
            <g key={i}>
              <Value x={x0 - 14} y={y + bh / 2} text={bucket.key} size={14} color={MUTED} anchor="end" />
              <rect x={x0} y={y} width={bw} height={bh} fill={PAPER} stroke={INK} strokeWidth={1.8} />
              {bucket.items.length === 0
                ? <line x1={x0 + 8} y1={y + bh - 8} x2={x0 + bw - 8} y2={y + 8} stroke={MUTED} strokeWidth={1.4} />
                : <circle cx={x0 + bw / 2} cy={y + bh / 2} r={3} fill={INK} />}
              {bucket.items.map((item, k) => {
                const x = x0 + bw + gap + k * (iw + gap);
                return (
                  <g key={k}>
                    <line x1={k ? x - gap : x0 + bw / 2} y1={y + bh / 2} x2={x - 2} y2={y + bh / 2} stroke={INK} strokeWidth={1.6} markerEnd={`url(#${marker}-ink)`} />
                    <Cell box={{ x, y: y + 5, w: iw, h: bh - 10 }} label={item} />
                  </g>
                );
              })}
            </g>
          );
        })}
      </>}
    </Frame>
  );
}

export function StructureFigure({ spec }: { spec: StructureSpec }) {
  switch (spec.type) {
    case "array": case "queue": return <Row spec={spec} />;
    case "stack": return <Stack spec={spec} />;
    case "linked-list": case "doubly-linked-list": return <LinkedList spec={spec} />;
    case "tree": return <Tree spec={spec} />;
    case "graph": return <Graph spec={spec} />;
    case "hash-table": return <HashTable spec={spec} />;
  }
}
