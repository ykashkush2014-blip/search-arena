// Localisation. Arabic is the source language of this game, so rather than
// threading keys through ~750 call sites, the Arabic text itself is the key
// and this module maps it to English. Three wins:
//
//   • t("ابدأ اللعب") replaces a literal with no other change, and a missing
//     translation falls back to Arabic instead of showing a key like
//     "btn.start" to a player.
//   • Text that reaches the DOM without going through t() is still covered:
//     translateDom() walks the rendered document and the title/placeholder/
//     aria attributes, so static markup is translated too.
//   • A MutationObserver keeps watching after boot, so lists, toasts, the HUD
//     and anything else re-rendered during play is translated as it appears.
//     That is what makes the ~150 template literals with numbers inside work
//     without a hand edit per string: they arrive as one text node and get
//     matched against the PATTERNS table below.
import { EN } from "./i18n-en.js";

const STORE_KEY = "conquest.lang";

let lang = "en"; // the game starts in English; see setLang()
const reverse = new Map(); // English → Arabic, for switching back

export function getLang() {
  return lang;
}

export function isRTL() {
  return lang === "ar";
}

export function setLang(next, { remember = true } = {}) {
  const l = next === "ar" ? "ar" : "en";
  if (l === lang && remember) return lang;
  lang = l;
  if (remember) {
    try {
      localStorage.setItem(STORE_KEY, l);
    } catch {
      /* private mode: the choice simply will not persist */
    }
  }
  const root = typeof document !== "undefined" ? document.documentElement : null;
  if (root) {
    root.lang = l;
    root.dir = l === "ar" ? "rtl" : "ltr";
    if (typeof document !== "undefined" && document.body) {
      document.body.classList.toggle("lang-en", l === "en");
      document.body.classList.toggle("lang-ar", l === "ar");
    }
  }
  return lang;
}

// Saved choice, or the default (English). Called once at boot.
export function loadLang() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORE_KEY);
  } catch {
    saved = null;
  }
  return setLang(saved === "ar" ? "ar" : "en", { remember: false });
}

// Resolve the language at import time, not at boot. The data tables in
// data.js and the campaign list translate themselves while their modules are
// being evaluated, which happens before boot() runs — so reading the saved
// choice here is what keeps a returning Arabic player from seeing English
// labels until the next reload.
let eager = false;
export function initLang() {
  if (eager) return lang;
  eager = true;
  return loadLang();
}
initLang();

// ---------------------------------------------------------------- translate ---
// t("نص عربي") → English when the language is English.
// Accepts an optional {placeholder} map: t("بعد {n} ثانية", { n: 5 }).
// Also accepts a composed sentence: the caller builds the Arabic sentence with
// the value substituted, and the pattern table translates it if it matches.
export function t(ar, vars) {
  const key = String(ar ?? "");
  let out = lang === "en" ? translateCore(key) : key;
  if (vars) {
    out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  }
  return out;
}

// Translate a value that may already be English: used for fields that come
// from game data in both languages (nations) and for labels we get from the
// server. Anything unknown passes straight through.
export function tBack(text) {
  if (lang !== "en" || !text) return text;
  buildReverse();
  return reverse.get(String(text)) || EN[String(text)] || String(text);
}

function buildReverse() {
  if (reverse.size) return;
  for (const [ar, en] of Object.entries(EN)) {
    if (!reverse.has(en)) reverse.set(en, ar);
  }
}

// ------------------------------------------------------------------ patterns ---
// Sentences the game builds by interpolating a number or a name into Arabic
// text. Word order differs in English, so these need a rule, not a lookup.
// `\u0660-\u0669` are Arabic-Indic digits, which arNum() uses in Arabic mode.
const NUM = "([0-9\\u0660-\\u0669][0-9\\u0660-\\u0669,.]*)";
const RULES = [
  ["دولة", `of the world`],
];

const PATTERNS = [
  // --- dates: "3000 ق.م" → "3000 BCE", "1200 م" → "1200 CE" (whole node only)
  [/^(.+) ق\.م$/, (m) => `${m[1]} BCE`],
  [/^(.+) م$/, (m) => `${m[1]} CE`],

  // --- country picker / HUD
  [/^أرضك: (.+) خلية • جيران: (.+)$/, (m) => `Your land: ${m[1]} cells • Neighbours: ${m[2]}`],
  [/^(.+) دولة$/, (m) => `${m[1]} countries`],
  [/^(.+) دولة تبدأ معك$/, (m) => `${m[1]} countries start with you`],
  [/^(.+) لاعبين$/, (m) => `${m[1]} players`],
  [/^(.+) لاعب$/, (m) => `${m[1]} player`],
  [/^(.+) خلية$/, (m) => `${m[1]} cells`],
  [/^(.+) مبنى$/, (m) => `${m[1]} buildings`],
  [/^(.+) أسطول$/, (m) => `${m[1]} fleets`],
  [/^(.+) حليف يقوّي دفاعك$/, (m) => `${m[1]} allies boost your defence`],
  [/^(.+) نقطة$/, (m) => `${m[1]} points`],
  [/^بدء المباراة: (.+)$/, (m) => `Match start: ${m[1]}`],
  [/^مباراة أونلاين — (.+) لاعبين$/, (m) => `Online match — ${m[1]} players`],
  [/^سيطر على (.+) من الأرض$/, (m) => `Control ${m[1]} of the world`],
  [/^(.+) من الأرض$/, (m) => `${m[1]} of the world`],
  [/^الهدف: (.+)$/, (m) => `Goal: ${m[1]}`],
  [/^الخريطة: (.+)$/, (m) => `Map: ${m[1]}`],
  [/^العصر: (.+)$/, (m) => `Era: ${m[1]}`],
  [/^الوضع: (.+)$/, (m) => `Mode: ${m[1]}`],
  [/^الخصوم: (.+)$/, (m) => `Opponents: ${m[1]}`],
  [/^غرفة (.+)$/, (m) => `Room ${m[1]}`],
  [/^عالم (.+)$/, (m) => `World ${m[1]}`],
  [/^مباراة أونلاين — (.+) لاعبين$/, (m) => `Online match — ${m[1]} players`],
  [/^جارٍ إعادة الاتصال… \(محاولة (.+)\)$/, (m) => `Reconnecting… (attempt ${m[1]})`],
  [/^عاد الاتصال — عالم (.+)$/, (m) => `Reconnected — world ${m[1]}`],
  [/^الهدنة سارية — تبقى (.+) ثانية$/, (m) => `Ceasefire holds — ${m[1]} seconds left`],
  [/^بحث (.+) → المستوى (.+)$/, (m) => `Research ${m[1]} → level ${m[2]}`],
  [/^تم احتلال (.+) بالكامل$/, (m) => `${m[1]} has been fully conquered`],
  [/^تم احتلال (.+) — خرج صاحبها من اللعبة$/, (m) => `${m[1]} was captured — its player is out`],
  [/^تم بناء (.+)$/, (m) => `Built ${m[1]}`],
  [/^تمت ترقية (.+) مبنى$/, (m) => `Upgraded ${m[1]} buildings`],
  [/^(.+) أصبح المستوى (.+)$/, (m) => `${m[1]} reached level ${m[2]}`],
  [/^هجوم على (.+) بـ (.+) جندي$/, (m) => `Attack on ${m[1]} with ${m[2]} troops`],
  [/^(.+) تهجم عليك!$/, (m) => `${m[1]} is attacking you!`],
  [/^(.+) تتقدم على حدودك \(\+(.+) خسائر\)$/, (m) => `${m[1]} pushes on your border (+${m[2]} losses)`],
  [/^(.+) استسلمت!$/, (m) => `${m[1]} surrendered!`],
  [/^(.+) أعلنت الحرب على (.+)$/, (m) => `${m[1]} declared war on ${m[2]}`],
  [/^(.+) تدخلت في الحرب إلى جانب حليفها (.+)$/, (m) => `${m[1]} joined the war on the side of its ally ${m[2]}`],
  [/^(.+) أرسلت لك (.+)$/, (m) => `${m[1]} sent you ${m[2]}`],
  [/^(.+) انضمت إلى حربك ضد (.+) وفتحت جبهة$/, (m) => `${m[1]} joined your war against ${m[2]} and opened a front`],
  [/^(.+) أعلنت الحرب على (.+) دعماً لك$/, (m) => `${m[1]} declared war on ${m[2]} in support of you`],
  [/^حلفاؤك في الحرب، لكن (.+) منهم بعيدون عن جبهة (.+)$/, (m) => `Your allies are in the war, but ${m[1]} of them are far from the ${m[2]} front`],
  [/^حلفاؤك انضموا إلى الحرب ضد (.+)$/, (m) => `Your allies joined the war against ${m[1]}`],
  [/^تحالف بين (.+) و(.+) — دفاع مشترك$/, (m) => `Alliance between ${m[1]} and ${m[2]} — mutual defence`],
  [/^وقف إطلاق النار بين (.+) و(.+)$/, (m) => `Ceasefire between ${m[1]} and ${m[2]}`],
  [/^أرسلت هدية إلى (.+)$/, (m) => `Sent a gift to ${m[1]}`],
  [/^رفضت عرض (.+)$/, (m) => `You rejected ${m[1]}'s offer`],
  [/^(.+) رفضت التحالف$/, (m) => `${m[1]} rejected the alliance`],
  [/^(.+) رفضت وقف إطلاق النار$/, (m) => `${m[1]} rejected the ceasefire`],
  [/^سقطت عاصمة (.+)! خسر (.+) جندي$/, (m) => `The capital of ${m[1]} has fallen! ${m[2]} troops lost`],
  [/^صدّيت هجوم (.+)!$/, (m) => `You repelled ${m[1]}'s attack!`],
  [/^نجح الإنزال البحري على سواحل (.+)!$/, (m) => `The naval landing on ${m[1]}'s coast succeeded!`],
  [/^إنزال بحري من (.+) على سواحلك!$/, (m) => `Naval landing by ${m[1]} on your coast!`],
  [/^توقف الهجوم على (.+) — أرسل تعزيزات أو انسحب$/, (m) => `The attack on ${m[1]} has stalled — send reinforcements or withdraw`],
  [/^توقف الهجوم على (.+)$/, (m) => `The attack on ${m[1]} has stalled`],
  [/^نفدت قوات الهجوم على (.+)$/, (m) => `Your attacking force against ${m[1]} is spent`],
  [/^أسطولك يتجه إلى (.+)$/, (m) => `Your fleet is heading for ${m[1]}`],
  [/^اضغط مرة أخرى لبدء الهجوم على (.+)$/, (m) => `Press again to attack ${m[1]}`],
  [/^غزو بحري على (.+)!$/, (m) => `Naval invasion of ${m[1]}!`],
  [/^إنزال على (.+)$/, (m) => `Land on ${m[1]}`],
  [/^كمّاشة على (.+)$/, (m) => `Pincer on ${m[1]}`],
  [/^سيطرت على (.+) من الأرض في (.+) دقيقة\.$/, (m) => `You controlled ${m[1]} of the world in ${m[2]} minutes.`],
  [/^وصلت إلى (.+) من الأرض\. حاول مرة أخرى!$/, (m) => `You reached ${m[1]} of the world. Try again!`],
  [/^وصلت إلى (.+) من الأرض\. حاول مرة أخرى$/, (m) => `You reached ${m[1]} of the world. Try again!`],
  [/^(.+) سيطرت على الأرض أولًا — جرّب مرة أخرى\.$/, (m) => `${m[1]} took the world first — try again.`],
  [/^ابدأ (.+)$/, (m) => `Start ${m[1]}`],
  [/^(.+) — عاد (.+) جندي إلى الاحتياط$/, (m) => `${m[1]} — ${m[2]} troops returned to reserve`],
  [/^(.+) اختار (.+)$/, (m) => `${m[1]} chose ${m[2]}`],
  [/^(.+) أعلنت الحرب على (.+)$/, (m) => `${m[1]} declared war on ${m[2]}`],
  [/^(.+) \(أنت\)$/, (m) => `${m[1]} (you)`],
];

// Inputs arrive as one composed Arabic sentence ("روسيا أعلنت الحرب على أوكرانيا"),
// so each rule captures the variable parts and reorders them in English.
// Same rules, but allowed to match in the middle of a longer string. Two places
// need this: a text node that mixes markup-derived pieces ("1 ◈ 0 مبنى Raises
// the army cap…") and a parent element whose innerHTML was written after its
// children were already visited by the observer.
// Rules that can safely fire inside a longer string. Only the ones where the
// Arabic is "number + noun" in a position English also accepts, so a partial
// rewrite never reorders a sentence it does not fully understand.
const INLINE = [
  [/([0-9\u0660-\u0669][0-9\u0660-\u0669,.]*)\s+مبنى/g, (m) => `${m[1]} buildings`],
  [/([0-9\u0660-\u0669][0-9\u0660-\u0669,.]*)\s+خلية/g, (m) => `${m[1]} cells`],
  [/([0-9\u0660-\u0669][0-9\u0660-\u0669,.]*)\s+جندي/g, (m) => `${m[1]} troops`],
];

function swapInline(text) {
  let s = String(text);
  for (const [re, fn] of INLINE) s = s.replace(re, (...a) => fn(a.slice(0, -2)));
  return s;
}

function swapPatternsWithin(text) {
  let s = swapInline(String(text));
  const replaceOnce = (re, fn) => {
    const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
    const global = new RegExp(re.source, flags);
    let changed = false;
    s = s.replace(global, (...args) => {
      const m = args.slice(0, -2); // drop offset + input
      changed = true;
      try {
        return fn(m);
      } catch {
        return m[0];
      }
    });
    return changed;
  };
  for (const [re, fn] of PATTERNS) {
    // anchored rules only make sense for a whole node; run them on the whole
    // string first (handled by swapPatterns) and skip them here
    if (re.source.startsWith("^")) {
      const whole = s.match(re);
      if (whole) {
        const out = swapPatterns(s);
        if (out !== s) s = out;
      }
      continue;
    }
    replaceOnce(re, fn);
  }
  // anchored forms embedded in a bigger string are rare; try them per sentence
  return s;
}

export function swapPatterns(text) {
  const s = String(text);
  for (const [re, fn] of PATTERNS) {
    const m = s.match(re);
    if (m) {
      try {
        return fn(m);
      } catch {
        return s;
      }
    }
  }
  return s;
}

// ------------------------------------------------------------- the sentence ---
// One entry point for "turn this Arabic into English". Used by t() at every
// call site and by translateText() for text that reached the DOM on its own,
// so the two paths can never drift apart.
function translateCore(text) {
  const core = String(text);
  if (!core) return core;

  const hit = EN[core]; // exact dictionary entry wins
  if (hit !== undefined) return hit;

  const nat = nationIn(core); // a nametag, tooltip or feed fragment
  if (nat) return nat;

  // Sentence rules, then inline number+noun rules, then any nation names left
  // inside the result: "بدء المباراة: روسيا" needs the rule for the frame and
  // the nation table for the tail.
  let out = swapPatterns(core);
  if (out === core) out = swapPatternsWithin(core);
  out = replaceNations(out);
  return out;
}

// ------------------------------------------------------------------- nations ---
// Country names are data, not copy: the map bundle carries both spellings. The
// only thing missing at the DOM layer is knowing which Arabic name is which
// country, so main.js hands that table over once at boot. That is what lets a
// bare "روسيا" — a nametag, a feed line, a tooltip — come out as "Russia".
let nations = new Map(); // Arabic name → English name
let nationRe = null; // cached alternation, rebuilt when the table changes

export function registerNationNames(pairs) {
  nations = new Map(pairs.filter(([ar, en]) => {
    // NB: filter() passes three arguments, so with a tuple destructure the
    // third would arrive as `en` if this were not a plain two-element check.
    // Keep it explicit: both spellings present and different.
    return !!ar && !!en && String(ar) !== String(en);
  }));
  nationRe = null;
}

function nationIn(text) {
  if (lang !== "en") return null;
  return nations.get(text) || null;
}

// ------------------------------------------------------------------ the DOM ---
const ATTRS = ["placeholder", "title", "aria-label", "alt"];

// One text node, one decision. Returns the replacement string, or null to keep
// the node as it is. Exact dictionary hits win; then the pattern table; then a
// mixed sentence is not touched (partial rewrites read worse than Arabic).
function translateText(raw) {
  const lead = raw.match(/^(\s*)/)[1];
  const trail = raw.match(/\s*$/)[0];
  const core = raw.trim();
  if (!core) return null;
  const out = translateCore(core);
  if (out === core) return null;
  return lead + out + trail;
}

function translateNodeText(node, reverseMode) {
  const raw = node.textContent;
  if (!raw || !raw.trim()) return;
  if (reverseMode) {
    buildReverse();
    const lead = raw.match(/^(\s*)/)[1];
    const trail = raw.match(/\s*$/)[0];
    const core = raw.trim();
    const ar = reverse.get(core);
    if (ar && ar !== core) node.textContent = lead + ar + trail;
    return;
  }
  const next = translateText(raw);
  if (next !== null && next !== raw) node.textContent = next;
}

function translateAttrs(el, reverseMode) {
  if (!el.getAttribute) return;
  for (const attr of ATTRS) {
    const v = el.getAttribute(attr);
    if (!v) continue;
    if (reverseMode) {
      buildReverse();
      const ar = reverse.get(v);
      if (ar) el.setAttribute(attr, ar);
    } else {
      const en = EN[v] ?? swapPatterns(v);
      if (en !== v) el.setAttribute(attr, en);
    }
  }
}

// The longest name first, so "الولايات المتحدة" is not damaged by a shorter
// neighbouring match, and the replacement is done in one pass.
function replaceNations(text) {
  if (lang !== "en" || !nations.size) return text;
  if (!nationRe) {
    const names = [...nations.keys()].sort((a, b) => b.length - a.length);
    nationRe = new RegExp("(" + names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
  }
  return text.replace(nationRe, (m) => nations.get(m) || m);
}

const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);

function translateTree(root, reverseMode) {
  if (!root) return;
  const visit = (node) => {
    if (node.nodeType === 1) {
      if (SKIP.has(node.nodeName)) return;
      translateAttrs(node, reverseMode);
    }
    if (node.nodeType === 3) {
      const p = node.parentNode;
      if (p && !SKIP.has(p.nodeName)) translateNodeText(node, reverseMode);
      return;
    }
    for (let c = node.firstChild; c; c = c.nextSibling) visit(c);
  };
  visit(root);
}

export function translateDom(root = typeof document !== "undefined" ? document.body : null) {
  if (!root) return;
  translateTree(root, lang !== "en");
}

// Keep translating after boot. Every innerHTML write, list rebuild and toast
// lands here, so gameplay text follows the language without extra call sites.
let observer = null;

export function watchDom(root = typeof document !== "undefined" ? document.body : null) {
  if (!root || typeof MutationObserver === "undefined") return;
  if (lang !== "en") return; // Arabic is the source text: nothing to rewrite
  if (observer) return;
  observer = new MutationObserver((records) => {
    observer.disconnect(); // avoid re-entering our own writes
    for (const rec of records) {
      if (rec.type === "childList") {
        for (const n of rec.addedNodes) translateTree(n, false);
      } else if (rec.type === "characterData") {
        translateNodeText(rec.target, false);
      } else if (rec.type === "attributes") {
        translateAttrs(rec.target, false);
      }
    }
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
}

export function unwatchDom() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}
