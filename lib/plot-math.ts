type Expr = (x: number) => number;
const functions: Record<string, (x: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log, sqrt: Math.sqrt, abs: Math.abs };

/** Small arithmetic grammar; never executes generated JavaScript. */
export function compileExpression(expression: string): Expr {
  if (expression.length > 240) throw new Error("Formula too long");
  const source = expression.replace(/\s+/g, "");
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-z]+|[()+\-*/^]/g) ?? [];
  if (tokens.join("") !== source || tokens.length > 120) throw new Error("Unsupported formula");
  let index = 0;
  const take = (token: string) => tokens[index] === token && (++index > 0);
  function atom(): Expr {
    const token = tokens[index++];
    if (token === "x") return x => x;
    if (token === "pi") return () => Math.PI;
    if (token === "e") return () => Math.E;
    if (token && /^(\d|\.)/.test(token)) return () => Number(token);
    if (token === "(") { const inner = sum(); if (!take(")")) throw new Error("Missing closing parenthesis"); return inner; }
    if (token && Object.hasOwn(functions, token) && take("(")) {
      const inner = sum(); if (!take(")")) throw new Error("Missing closing parenthesis");
      return x => functions[token](inner(x));
    }
    throw new Error("Unsupported formula");
  }
  function power(): Expr { const a = atom(); if (take("^")) { const b = unary(); return x => a(x) ** b(x); } return a; }
  function unary(): Expr { if (take("-")) { const a = unary(); return x => -a(x); } if (take("+")) return unary(); return power(); }
  function product(): Expr {
    let a = unary();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const op = tokens[index++]; const left = a; const right = unary(); a = op === "*" ? x => left(x) * right(x) : x => left(x) / right(x);
    }
    return a;
  }
  function sum(): Expr {
    let a = product();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const op = tokens[index++]; const left = a; const right = product(); a = op === "+" ? x => left(x) + right(x) : x => left(x) - right(x);
    }
    return a;
  }
  const evaluate = sum();
  if (index !== tokens.length) throw new Error("Unsupported formula");
  return evaluate;
}

export function niceTicks(min: number, max: number): Array<{value: number; label: string}> {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const raw = (max - min) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
  const ticks = [];
  for (let i = Math.ceil(min / step); i <= Math.floor(max / step) && ticks.length < 20; i++) {
    const value = Number((i * step).toPrecision(10));
    ticks.push({ value, label: String(value) });
  }
  return ticks;
}

export function sampleExpression(expression: string, xMin: number, xMax: number, yMin: number, yMax: number) {
  const evaluate = compileExpression(expression);
  const segments: Array<Array<{x: number; y: number}>> = [];
  let current: Array<{x: number; y: number}> = [];
  for (let i = 0; i <= 400; i++) {
    const x = xMin + (xMax - xMin) * i / 400;
    const y = evaluate(x);
    const previous = current.at(-1);
    if (!Number.isFinite(y) || y < yMin - (yMax-yMin) || y > yMax + (yMax-yMin) ||
        (previous && Math.abs(previous.y-y) > (yMax-yMin)*0.5)) {
      if (current.length > 1) segments.push(current); current = []; continue;
    }
    current.push({ x, y });
  }
  if (current.length > 1) segments.push(current);
  return segments;
}
