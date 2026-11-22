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
