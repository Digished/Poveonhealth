#!/usr/bin/env node
/**
 * Catch `const`/`let` bindings read above their own declaration during render.
 *
 * TypeScript flags a direct use-before-declaration (TS2448), but not one inside
 * an arrow function — a closure *could* run later, so it assumes it does. When
 * the closure is an argument to a synchronous array method, it does not:
 *
 *   const current = LIST.find((i) => i.key === activeTab);   // runs now
 *   const [activeTab] = useState(...);                       // declared below
 *
 * That shipped, and surfaced only as a minified
 * "ReferenceError: Cannot access 'c' before initialization" from the deployed
 * build. Nothing in `tsc` or the type checker sees it.
 *
 * This walks the real AST rather than the text. A first attempt matched
 * identifier names line-by-line and produced fifty findings, essentially all of
 * them callback parameters colliding with unrelated declarations elsewhere in
 * the file — so scope resolution is the whole job, not a refinement of it.
 *
 *   node scripts/check-tdz.mjs [paths...]     (defaults to src/)
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Methods that invoke their callback before returning. */
const SYNC_METHODS = new Set([
  "map", "filter", "find", "findIndex", "findLast", "findLastIndex", "forEach",
  "some", "every", "reduce", "reduceRight", "flatMap", "sort", "toSorted",
]);

function collect(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next") collect(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Every name bound by a declaration name node (handles destructuring). */
function boundNames(name, into) {
  if (ts.isIdentifier(name)) into.push(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) boundNames(el.name, into);
    }
  }
  return into;
}

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ["src"];
const files = roots.flatMap((r) => (fs.statSync(r).isDirectory() ? collect(r) : [r]));
const findings = [];

for (const file of files) {
  const src = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  /**
   * Walk a scope, tracking the block-scoped bindings declared in it and where.
   * `shadowed` carries names bound by enclosing parameters and inner scopes, so
   * a callback parameter never resolves to an outer declaration.
   */
  function walkScope(scopeNode, statements, outerShadow) {
    // Where each const/let in THIS scope is declared.
    const declaredAt = new Map();
    for (const st of statements) {
      if (!ts.isVariableStatement(st)) continue;
      const flags = ts.getCombinedNodeFlags(st.declarationList);
      const blockScoped = (flags & ts.NodeFlags.Const) || (flags & ts.NodeFlags.Let);
      if (!blockScoped) continue;
      for (const d of st.declarationList.declarations) {
        for (const n of boundNames(d.name, [])) {
          if (!declaredAt.has(n)) declaredAt.set(n, d.getStart(src));
        }
      }
    }
    if (declaredAt.size === 0) return;

    /** Names bound by a function's own parameters and locals. */
    function scopeOf(fn, shadow) {
      const inner = new Set(shadow);
      for (const p of fn.parameters) for (const n of boundNames(p.name, [])) inner.add(n);
      if (fn.body) {
        ts.forEachChild(fn.body, function decls(n) {
          if (ts.isVariableDeclaration(n)) for (const b of boundNames(n.name, [])) inner.add(b);
          ts.forEachChild(n, decls);
        });
      }
      return inner;
    }

    // Find references to those names inside synchronous callbacks that sit
    // above the declaration.
    // `escaped` means we have descended into a function that is merely *defined*
    // here rather than invoked here — a component body at module level, an event
    // handler, an effect. Its code runs long after this scope finished
    // evaluating, so a later declaration is already initialised by then and
    // there is no hazard. Without this the module scope reports every component
    // that reads a const defined below it, which is normal and correct code.
    (function visit(node, shadow, inSyncCallback, escaped) {
      // A nested function introduces its own scope; recurse with its params
      // shadowed, and reset the "synchronous" context unless we are entering a
      // sync callback argument.
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const isSync =
          ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.name) &&
          SYNC_METHODS.has(callee.name.text);
        visit(callee, shadow, inSyncCallback, escaped);
        for (const arg of node.arguments) {
          const isFn = ts.isArrowFunction(arg) || ts.isFunctionExpression(arg);
          if (isFn && isSync && !escaped) {
            // The one case that stays in this evaluation: the callback runs
            // before the call returns. Step into its body directly, so the
            // generic function branch below cannot mark it deferred.
            visit(arg.body, scopeOf(arg, shadow), true, false);
          } else {
            visit(arg, shadow, false, true);
          }
        }
        return;
      }

      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
        // Any other function is only being *defined* here. Whatever it reads,
        // it reads after this scope has finished evaluating.
        if (node.body) visit(node.body, scopeOf(node, shadow), false, true);
        return;
      }

      if (inSyncCallback && !escaped && ts.isIdentifier(node)) {
        const parent = node.parent;
        // Skip property names (`x.activeTab`) and object keys.
        const isProperty =
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node) ||
          ts.isBindingElement(parent);
        if (!isProperty && !shadow.has(node.text) && declaredAt.has(node.text)) {
          const declPos = declaredAt.get(node.text);
          if (node.getStart(src) < declPos) {
            const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
            const dl = src.getLineAndCharacterOfPosition(declPos).line;
            findings.push({ file, line: line + 1, name: node.text, declLine: dl + 1 });
          }
        }
      }

      ts.forEachChild(node, (c) => visit(c, shadow, inSyncCallback, escaped));
    })(scopeNode, new Set(outerShadow), false, false);
  }

  // Every function body in the file is a scope worth checking.
  (function findScopes(node, shadow) {
    if (
      (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) &&
      node.body &&
      ts.isBlock(node.body)
    ) {
      const inner = new Set(shadow);
      for (const p of node.parameters) for (const n of boundNames(p.name, [])) inner.add(n);
      walkScope(node.body, node.body.statements, inner);
      ts.forEachChild(node.body, (c) => findScopes(c, inner));
      return;
    }
    ts.forEachChild(node, (c) => findScopes(c, shadow));
  })(src, new Set());

  // Module top level too.
  walkScope(src, src.statements, new Set());
}

// One line per distinct finding.
const seen = new Set();
const unique = findings.filter((f) => {
  const k = `${f.file}:${f.line}:${f.name}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

if (unique.length) {
  for (const f of unique) {
    console.error(`${f.file}:${f.line}  '${f.name}' is read inside a synchronous callback but declared on line ${f.declLine}`);
  }
  console.error(`\n${unique.length} temporal-dead-zone read(s). Move the declaration above the use.`);
  process.exit(1);
}
console.log("No synchronous reads of a binding above its declaration.");
