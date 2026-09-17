/**
 * Template language:
 *   {{username}}                       — variable
 *   {{#if streak > 7}}A{{else}}B{{/if}} — if / else
 *   {{#if streak > 30}}A{{else if streak > 7}}B{{else}}C{{/if}}
 *   {{randomize{A|B|C}}}               — pick one option at random
 *   {{#randomize}}A{{or}}B{{or}}C{{/randomize}}
 *
 * Comparisons: >, >=, <, <=, ==, !=
 * Bare keys are truthy checks: {{#if isLastChance}}...{{/if}}
 * Tests can set context.__randomIndex to force a choice.
 */

const IF_OPEN = /^\{\{#if\s+(.+?)\}\}/;
const ELSE_IF = /^\{\{else\s+if\s+(.+?)\}\}/;
const ELSE = /^\{\{else\}\}/;
const IF_CLOSE = /^\{\{\/if\}\}/;
const RAND_OPEN = /^\{\{#randomize\}\}/;
const RAND_OR = /^\{\{or\}\}/;
const RAND_CLOSE = /^\{\{\/randomize\}\}/;
/** Compact: {{randomize{A|B|C}}} — options cannot contain } */
const RAND_COMPACT = /^\{\{randomize\{([^}]*)\}\}\}/;
const VAR = /\{\{(\w+)\}\}/g;

function isTruthy(val: unknown): boolean {
  if (val === undefined || val === null || val === false || val === '') {
    return false;
  }
  if (typeof val === 'number' && Number.isNaN(val)) return false;
  return true;
}

function resolveToken(
  token: string,
  context: Record<string, unknown>,
): unknown {
  const t = token.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (Object.prototype.hasOwnProperty.call(context, t)) {
    return context[t];
  }
  return t;
}

function toComparable(val: unknown): string | number | boolean {
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    if (/^-?\d+(\.\d+)?$/.test(val)) return Number(val);
    return val;
  }
  if (val == null) return '';
  return String(val);
}

export function evalCondition(
  expr: string,
  context: Record<string, unknown>,
): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return false;

  const opMatch = trimmed.match(/^(\w+)\s*(>=|<=|==|!=|>|<)\s*(.+)$/);
  if (opMatch) {
    const [, leftKey, op, rightRaw] = opMatch;
    const left = toComparable(resolveToken(leftKey, context));
    const right = toComparable(resolveToken(rightRaw, context));

    switch (op) {
      case '>':
        return Number(left) > Number(right);
      case '>=':
        return Number(left) >= Number(right);
      case '<':
        return Number(left) < Number(right);
      case '<=':
        return Number(left) <= Number(right);
      case '==':
        return left == right; // eslint-disable-line eqeqeq
      case '!=':
        return left != right; // eslint-disable-line eqeqeq
      default:
        return false;
    }
  }

  return isTruthy(resolveToken(trimmed, context));
}

function pickRandom<T>(
  items: T[],
  context: Record<string, unknown>,
): T {
  if (items.length === 0) {
    throw new Error('pickRandom called with empty list');
  }
  const forced = context.__randomIndex;
  if (typeof forced === 'number' && Number.isFinite(forced)) {
    const idx = ((forced % items.length) + items.length) % items.length;
    return items[idx];
  }
  return items[Math.floor(Math.random() * items.length)];
}

type Branch = { cond: string | null; body: string };

/** Find the next top-level {{#if}}…{{/if}} starting at `from`. */
function findIfBlock(
  text: string,
  from = 0,
): { start: number; end: number; branches: Branch[] } | null {
  const openIdx = text.indexOf('{{#if ', from);
  if (openIdx === -1) return null;

  const afterOpen = text.slice(openIdx);
  const openMatch = afterOpen.match(IF_OPEN);
  if (!openMatch) return null;

  let cursor = openIdx + openMatch[0].length;
  let depth = 1;
  const branches: Branch[] = [{ cond: openMatch[1].trim(), body: '' }];
  let bodyStart = cursor;

  while (cursor < text.length) {
    if (text.startsWith('{{', cursor)) {
      const rest = text.slice(cursor);

      if (IF_OPEN.test(rest)) {
        depth += 1;
        const m = rest.match(IF_OPEN)!;
        cursor += m[0].length;
        continue;
      }

      if (depth === 1 && ELSE_IF.test(rest)) {
        branches[branches.length - 1].body = text.slice(bodyStart, cursor);
        const m = rest.match(ELSE_IF)!;
        branches.push({ cond: m[1].trim(), body: '' });
        cursor += m[0].length;
        bodyStart = cursor;
        continue;
      }

      if (depth === 1 && ELSE.test(rest)) {
        branches[branches.length - 1].body = text.slice(bodyStart, cursor);
        branches.push({ cond: null, body: '' });
        cursor += rest.match(ELSE)![0].length;
        bodyStart = cursor;
        continue;
      }

      if (IF_CLOSE.test(rest)) {
        depth -= 1;
        const m = rest.match(IF_CLOSE)!;
        if (depth === 0) {
          branches[branches.length - 1].body = text.slice(bodyStart, cursor);
          return {
            start: openIdx,
            end: cursor + m[0].length,
            branches,
          };
        }
        cursor += m[0].length;
        continue;
      }
    }
    cursor += 1;
  }

  return null;
}

/** Find {{#randomize}}…{{or}}…{{/randomize}} */
function findRandomizeBlock(
  text: string,
  from = 0,
): { start: number; end: number; options: string[] } | null {
  const openIdx = text.indexOf('{{#randomize}}', from);
  if (openIdx === -1) return null;

  let cursor = openIdx + '{{#randomize}}'.length;
  let depth = 1;
  const options: string[] = [];
  let bodyStart = cursor;

  while (cursor < text.length) {
    if (text.startsWith('{{', cursor)) {
      const rest = text.slice(cursor);

      if (RAND_OPEN.test(rest)) {
        depth += 1;
        cursor += rest.match(RAND_OPEN)![0].length;
        continue;
      }

      if (depth === 1 && RAND_OR.test(rest)) {
        options.push(text.slice(bodyStart, cursor));
        cursor += rest.match(RAND_OR)![0].length;
        bodyStart = cursor;
        continue;
      }

      if (RAND_CLOSE.test(rest)) {
        depth -= 1;
        const m = rest.match(RAND_CLOSE)!;
        if (depth === 0) {
          options.push(text.slice(bodyStart, cursor));
          return {
            start: openIdx,
            end: cursor + m[0].length,
            options,
          };
        }
        cursor += m[0].length;
        continue;
      }
    }
    cursor += 1;
  }

  return null;
}

/** Find compact {{randomize{A|B|C}}} */
function findCompactRandomize(
  text: string,
  from = 0,
): { start: number; end: number; options: string[] } | null {
  const openIdx = text.indexOf('{{randomize{', from);
  if (openIdx === -1) return null;
  const rest = text.slice(openIdx);
  const match = rest.match(RAND_COMPACT);
  if (!match) return null;
  const options = match[1]
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (options.length === 0) return null;
  return {
    start: openIdx,
    end: openIdx + match[0].length,
    options,
  };
}

function leftmostBlock(
  text: string,
):
  | { kind: 'if'; start: number; end: number; branches: Branch[] }
  | { kind: 'randomize'; start: number; end: number; options: string[] }
  | null {
  const ifBlock = findIfBlock(text, 0);
  const randBlock = findRandomizeBlock(text, 0);
  const compact = findCompactRandomize(text, 0);

  type Cand =
    | { kind: 'if'; start: number; end: number; branches: Branch[] }
    | { kind: 'randomize'; start: number; end: number; options: string[] };

  const cands: Cand[] = [];
  if (ifBlock) cands.push({ kind: 'if', ...ifBlock });
  if (randBlock) cands.push({ kind: 'randomize', ...randBlock });
  if (compact) cands.push({ kind: 'randomize', ...compact });
  if (cands.length === 0) return null;
  cands.sort((a, b) => a.start - b.start);
  return cands[0];
}

function renderBlocks(
  text: string,
  context: Record<string, unknown>,
): string {
  let out = text;
  let guard = 0;
  while (guard < 80) {
    guard += 1;
    const block = leftmostBlock(out);
    if (!block) break;

    let chosen = '';
    if (block.kind === 'if') {
      for (const branch of block.branches) {
        if (branch.cond === null || evalCondition(branch.cond, context)) {
          chosen = branch.body;
          break;
        }
      }
    } else {
      chosen = pickRandom(block.options, context);
    }

    chosen = renderBlocks(chosen, context);
    out = out.slice(0, block.start) + chosen + out.slice(block.end);
  }
  return out;
}

function renderVars(text: string, context: Record<string, unknown>): string {
  return text.replace(VAR, (_, key: string) => {
    const val = context[key];
    return val !== undefined && val !== null ? String(val) : '';
  });
}

/**
 * Rich-text bodies often wrap/split tokens with tags, which breaks
 * {{randomize{…}}} / {{#if}} matching. Strip to plain text first.
 */
export function stripTemplateHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderTemplate(
  text: string,
  context: Record<string, unknown>,
): string {
  if (!text) return '';
  return renderVars(renderBlocks(text, context), context);
}

/** For notification templates (rich-text body → plain email). */
export function renderPlainTemplate(
  text: string,
  context: Record<string, unknown>,
): string {
  return renderTemplate(stripTemplateHtml(text ?? ''), context);
}
