// Build a single self-contained HTML file of the whole game.
//
// Why: the published game is a static page that pulls ~12 ES modules plus a
// 291 KB map bundle over the network. That is fine online, but it means the
// game cannot be opened from disk, cannot be emailed, and breaks the moment a
// CDN or the hosting is unavailable. This script inlines every module, the
// stylesheet and the map data into one .html file that runs from a double
// click.
//
// How: each module is wrapped in its own function scope with a tiny CommonJS
// style loader. That keeps module semantics (no duplicate top-level names, no
// hoisting surprises between modules) without needing a build toolchain.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const read = (p) => readFileSync(join(ROOT, p), "utf8");

// Dependency order does not matter for the loader (it is lazy), but keeping a
// stable list makes the generated file diff-friendly.
const MODULES = [
  "js/rng.js",
  "js/data.js",
  "js/world.js",
  "js/state.js",
  "js/render.js",
  "js/campaigns.js",
  "js/audio.js",
  "js/net.js",
  "js/main.js",
];

// ------------------------------------------------------------------ rewrite ---
// Turn `import { a, b as c } from "./x.js"` / `import * as ns` / `import x`
// into `const { a, b: c } = __req("js/x.js")`, and collect re-exports so that
// `export { a } from "./x.js"` still works. Bare imports of node builtins do
// not exist in the browser build, so they are rejected loudly instead of
// silently producing a broken file.
function rewriteImports(code, file) {
  const dir = dirname(file);
  const resolve = (spec) => {
    if (!spec.startsWith(".")) throw new Error(`${file}: cannot bundle bare import "${spec}"`);
    const abs = join(dir, spec).replace(/\\/g, "/");
    const normalised = abs.startsWith("js/") ? abs : abs;
    return normalised;
  };

  // export { x } from "./y.js";  and  export * from "./y.js";
  const reexports = [];
  code = code.replace(
    /^export\s+\{([^}]*)\}\s+from\s+["']([^"']+)["'];?/gm,
    (_m, names, spec) => {
      const target = resolve(spec);
      reexports.push({ names, target });
      const list = names
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/\s+as\s+/, ": "));
      return `const { ${list.join(", ")} } = __req("${target}");`;
    }
  );
  code = code.replace(/^export\s+\*\s+from\s+["']([^"']+)["'];?/gm, (_m, spec) => {
    reexports.push({ names: "*", target: resolve(spec) });
    return `__reexport(__req("${resolve(spec)}"));`;
  });

  // import ... from "./y.js"
  code = code.replace(
    /^import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/gm,
    (_m, clause, spec) => {
      const target = resolve(spec);
      const c = clause.trim();
      if (c.startsWith("*")) {
        const ns = c.replace(/^\*\s*as\s*/, "");
        return `const ${ns} = __req("${target}");`;
      }
      const named = c.match(/^\{([\s\S]*)\}$/);
      if (named) {
        const list = named[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => s.replace(/\s+as\s+/, ": "));
        return `const { ${list.join(", ")} } = __req("${target}");`;
      }
      // default import (only `import x from`), possibly with named too
      const mixed = c.match(/^([A-Za-z_$][\w$]*)\s*,\s*\{([\s\S]*)\}$/);
      if (mixed) {
        const list = mixed[2]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => s.replace(/\s+as\s+/, ": "));
        return `const ${mixed[1]} = __req("${target}").default;\nconst { ${list.join(", ")} } = __req("${target}");`;
      }
      return `const ${c} = __req("${target}").default;`;
    }
  );

  // Dynamic imports: `await import("./y.js")` -> `Promise.resolve(__req("y"))`
  code = code.replace(/await\s+import\(\s*["']([^"']+)["']\s*\)/g, (_m, spec) => {
    return `await Promise.resolve(__req("${resolve(spec)}"))`;
  });
  // `import("./y.js")` used as a promise without await
  code = code.replace(/(?<![.\w])import\(\s*["']([^"']+)["']\s*\)/g, (_m, spec) => {
    return `Promise.resolve(__req("${resolve(spec)}"))`;
  });

  // The map bundle special case: world.js does
  //   const mod = await import("../data/world-data.js"); WORLD = mod.WORLD
  // After rewriting that becomes __req("data/world-data.js") returning WORLD
  // directly, so map it to an object with the same shape.

  // exports
  const exported = [];
  code = code.replace(/^export\s+((?:async\s+)?function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_m, kind, name) => {
    exported.push(name);
    return `${kind} ${name}`;
  });
  // NB: never pass a replacement *string* here. `$` sequences in it are
  // special ($&, $$, $'), and the game code contains `const $$ = (sel) => …`,
  // which a string replacement silently turned into a second `const $` and
  // broke the whole bundle. A replacer function returns text verbatim.
  code = code.replace(/^export\s+default\s+/gm, () => "const __default = ");
  if (code.includes("const __default = ")) exported.push("__default:default");

  // collect `export { a, b as c }` with no `from`
  code = code.replace(/^export\s+\{([^}]*)\};?/gm, (_m, names) => {
    for (const raw of names.split(",")) {
      const s = raw.trim();
      if (!s) continue;
      const m = s.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (m) exported.push(m[2] ? `${m[1]}:${m[2]}` : m[1]);
    }
    return "";
  });

  const reexportLines = reexports
    .map(({ names, target }) =>
      names === "*"
        ? `__reexport(__req("${target}"));`
        : `{ const __r = __req("${target}"); ${names
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => {
              const m = s.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
              return m ? `__exp.${m[2] || m[1]} = __r.${m[1]};` : "";
            })
            .join(" ")} }`
    )
    .join("\n");

  // Drop leading `export` that we did not catch (e.g. `export { x }` handled).
  if (/^export\s/m.test(code)) {
    const leftover = code.match(/^export\s.*/m);
    throw new Error(`${file}: unhandled export syntax: ${leftover[0]}`);
  }

  const returnList = exported
    .map((e) => {
      const [local, alias] = e.split(":");
      return alias && alias !== local ? `${alias}: ${local}` : local;
    })
    .join(", ");

  // The body must come first: exports are just bindings added to the module's
  // live scope, and the return object is what the loader hands to importers.
  return `${code}\n${reexportLines}\n__exp.__done = true;\nreturn { ${returnList} };`;
}

// ------------------------------------------------------------------- build ---
const parts = [];

// The map data module: instead of a real module, a raw object literal handed to
// the loader. 291 KB of JSON, so it is inlined last to keep the more readable
// game code near the top of the file.
// data/world-data.js contains the object literal plus a trailing
// `export default WORLD;` — take only the literal and fail loudly if the
// shape ever changes, rather than emitting a file that throws at parse time.
const worldSrc = read("data/world-data.js").replace(/^\/\/.*\n/gm, "").trim();
const m = worldSrc.match(/^export\s+const\s+WORLD\s*=\s*([\s\S]*?);\s*(?:export\s+default\s+WORLD;?)?\s*$/);
if (!m) throw new Error("data/world-data.js: unexpected shape, can not extract WORLD");
const worldJson = m[1];

for (const file of MODULES) {
  const src = read(file);
  const body = rewriteImports(src, file);
  parts.push(`__def("${file}", function (__req, __exp, __reexport) {\n${body}\n});`);
}
parts.push(`__def("data/world-data.js", function (__req, __exp) { __exp.WORLD = ${worldJson}; return { WORLD: __exp.WORLD }; });`);

const css = read("styles.css");
const hero = readFileSync(join(ROOT, "media/hero.jpg"));
const heroB64 = hero.toString("base64");

// index.html: keep the markup, drop the module script, stylesheet link and the
// Google Fonts (they need the network; a single file must open offline, so the
// font stack degrades to the system Arabic fonts already in styles.css).
let html = read("index.html");
html = html.replace(/<link rel="preconnect"[^>]*>\s*/g, "");
html = html.replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, "");
html = html.replace(/<link rel="stylesheet" href="\.\/styles\.css"\s*\/?>\s*/g, "");
html = html.replace(/<script type="module" src="\.\/js\/main\.js"><\/script>\s*/g, "");

const loader = `
<script>
/* ---------------------------------------------------------------------------
   CONQUEST — single file build.
   Everything (game rules, renderer, map data, styles) is inlined below so the
   file runs from disk with no server and no network. The online mode still
   needs the network, because a match has to be hosted somewhere.
   --------------------------------------------------------------------------- */
(function () {
  "use strict";

  var __defs = Object.create(null);
  var __cache = Object.create(null);

  function __def(name, factory) { __defs[name] = factory; }

  function __req(name) {
    if (__cache[name]) return __cache[name];
    var factory = __defs[name];
    if (!factory) throw new Error("module not bundled: " + name);
    var exp = (__cache[name] = {});
    var out = factory(__req, exp, function (src) {
      for (var k in src) if (k !== "__done") exp[k] = src[k];
    });
    if (out) for (var k in out) exp[k] = out[k];
    return exp;
  }

${parts.join("\n\n")}

  // Start the game once the markup is in place.
  __req("js/main.js");

  // Remove the loading overlay the page starts with.
  var boot = document.getElementById("boot-splash");
  if (boot) boot.remove();
})();
<\/script>`;

// Inject the stylesheet and the bundled script just before </body>.
// Replacer FUNCTION, not a string: the bundled game code contains `const $$`
// and `$&`-like sequences, which a string replacement would rewrite ($ is a
// substitution metacharacter). This one line corrupted the whole bundle and
// cost a long hunt — do not "simplify" it back to a string.
html = html.replace(
  /<\/body>/,
  () => `<style>\n${css}\n</style>\n${loader}\n</body>`
);
// The hero image lived in ./media/hero.jpg; make it inline.
html = html.replace(/url\("\.\/media\/hero\.jpg"\)/g, () => `url("data:image/jpeg;base64,${heroB64}")`);

mkdirSync(join(ROOT, "dist"), { recursive: true });
const out = join(ROOT, "dist/conquest.html");
writeFileSync(out, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✓ dist/conquest.html — ${kb} KB (${MODULES.length} modules + map + styles inlined)`);
