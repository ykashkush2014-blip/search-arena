// Single source of truth for the pinned bootstrap page.
//
// The static hosting (Vercel/Netlify/GitHub Pages) serves a tiny HTML page that
// loads the real game from an immutable jsDelivr copy of this repository. The
// Node server serves the very same page on "/", so both entry points always
// agree. `scripts/gen-deploy.mjs` writes deploy/index.html from this module —
// never edit deploy/index.html by hand.
export function deployPage(ref) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#070c14" />
  <title>CONQUEST — فتح العالم</title>
  <style>
    html, body { margin: 0; height: 100%; background: #070c14; color: #e7eef7;
      font-family: system-ui, "Segoe UI", Tahoma, sans-serif; }
    #boot { position: fixed; inset: 0; display: grid; place-content: center;
      text-align: center; gap: 10px; z-index: 9999; background: #070c14; }
    #boot h1 { margin: 0; font-size: 22px; letter-spacing: 1px; color: #f4d27a; }
    #boot p { margin: 0; font-size: 13px; color: #8797ab; max-width: 30ch; line-height: 1.7; }
    #boot .bar { width: 220px; height: 4px; border-radius: 4px; background: #16202e; overflow: hidden; margin: 6px auto 0; }
    #boot .bar i { display: block; height: 100%; width: 40%; background: #f4d27a;
      animation: slide 1.1s ease-in-out infinite alternate; }
    @keyframes slide { from { transform: translateX(-60%); } to { transform: translateX(160%); } }
  </style>
</head>
<body>
  <div id="boot">
    <h1>⚔️ CONQUEST</h1>
    <p>جارٍ تحميل اللعبة…</p>
    <div class="bar"><i></i></div>
  </div>

  <script type="module">
    const REF = "${ref}";
    const CDN = "https://cdn.jsdelivr.net/gh/ykashkush2014-blip/search-arena@" + REF + "/conquest/";
    const RAW = "https://raw.githubusercontent.com/ykashkush2014-blip/search-arena/" + REF + "/conquest/";
    const boot = document.getElementById("boot");
    const fail = (msg) => {
      boot.innerHTML = "<h1>⚠️ تعذر التحميل</h1><p>" + msg + "</p>";
    };
    try {
      let BASE = CDN;
      let res = null;
      for (const b of [CDN, RAW]) {
        try {
          const r = await fetch(b + "index.html", { cache: "no-store" });
          if (r.ok) { BASE = b; res = r; break; }
        } catch (e) { /* try the next mirror */ }
      }
      if (!res) throw new Error("assets unreachable");
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      for (const el of doc.querySelectorAll("[src], [href]")) {
        for (const attr of ["src", "href"]) {
          const val = el.getAttribute(attr);
          if (val && !/^(https?:|data:|#|mailto:|\\/\\/)/.test(val)) {
            el.setAttribute(attr, new URL(val, BASE).href);
          }
        }
      }
      doc.querySelectorAll('script[src*="js/main.js"]').forEach((s) => s.remove());
      document.title = doc.title || document.title;
      document.body.innerHTML = doc.body.innerHTML;
      for (const style of doc.head.querySelectorAll("style, link")) {
        document.head.appendChild(style.cloneNode(true));
      }
      boot.remove();
      await import(BASE + "js/main.js");
    } catch (err) {
      console.error(err);
      fail("تعذر الوصول إلى ملفات اللعبة. تحقق من اتصالك بالإنترنت ثم أعد تحميل الصفحة.");
    }
  </script>
</body>
</html>
`;
}

// The commit whose assets the deployed page loads. Bump it (or let publish.sh
// rewrite it) whenever the game ships, so the public link never serves stale code.
export const DEPLOY_REF = "f7d929cb5fc2bc528ba99355991194d4fa13a454";
