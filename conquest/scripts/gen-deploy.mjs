// Writes conquest/deploy/index.html from js/deploypage.js (single source of truth).
//   node scripts/gen-deploy.mjs            # use the pinned DEPLOY_REF
//   node scripts/gen-deploy.mjs <sha>      # pin a specific commit
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deployPage, DEPLOY_REF } from "../js/deploypage.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ref = (process.argv[2] || DEPLOY_REF).trim();
if (!/^[a-f0-9]{7,40}$/.test(ref)) {
  console.error("✗ ref غير صالح:", ref);
  process.exit(1);
}
const out = path.join(here, "..", "deploy", "index.html");
fs.writeFileSync(out, deployPage(ref), "utf8");
console.log("✓ deploy/index.html ← ref", ref.slice(0, 7), `(${fs.statSync(out).size} بايت)`);

// Keep the source of truth in step. The Vercel serverless function renders the
// page from js/deploypage.js at request time, so a stale DEPLOY_REF there
// silently serves an old build even after deploy/index.html was regenerated.
const src = path.join(here, "..", "js", "deploypage.js");
let text = fs.readFileSync(src, "utf8");
const next = text.replace(/export const DEPLOY_REF = "[a-f0-9]{7,40}";/, `export const DEPLOY_REF = "${ref}";`);
if (next !== text) {
  fs.writeFileSync(src, next, "utf8");
  console.log("✓ js/deploypage.js ← DEPLOY_REF", ref.slice(0, 7));
} else {
  console.log("• js/deploypage.js ← DEPLOY_REF مطابق أصلًا");
}
