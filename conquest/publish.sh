#!/usr/bin/env bash
# CONQUEST — نشر الأونلاين على Fly.io بأمر واحد، من أي مكان على جهازك.
#
#   APP=conquest-online bash conquest/publish.sh
#
# ماذا يفعل؟
#   1) يثبّت fly تلقائيًا إن لم تكن موجودة، ويسجّل الدخول إن لزم.
#   2) ينزّل مجلد conquest فقط من المستودع (git، أو tar إن لم يوجد git).
#   3) يضبط اسم التطبيق في fly.toml (لأن أسماء Fly عالمية وفريدة).
#   4) ينشئ التطبيق أول مرة ثم ينشره، ويطبع الرابط.
#
# متغيّرات اختيارية:
#   APP=conquest-khalil   اسم التطبيق — إنجليزي فقط، وأرقام/شرطات (افتراضيًا اسم عشوائي)
#   REGION=fra            المنطقة (fra أمستردام… افتراضي fra)
#   BRANCH=arena/...      الفرع (افتراضي: الفرع الذي بنى فيه هذا الملف)
set -uo pipefail

REPO_SLUG="${REPO_SLUG:-ykashkush2014-blip/search-arena}"
BRANCH="${BRANCH:-arena/07357b19-search-arena}"
REGION="${REGION:-fra}"
APP="${APP:-conquest-online-$(( (RANDOM % 9000) + 1000 ))}"
case "$APP" in
  *[!a-z0-9-]*|[0-9]*)
    printf "\n\033[1;31m✗ اسم التطبيق يجب أن يكون إنجليزيًا بحروف صغيرة وأرقام وشرطات فقط: %s\033[0m\n" "$APP" >&2
    echo "  مثال: APP=conquest-khalil bash publish.sh"
    exit 1 ;;
esac
say() { printf '\n\033[1;33m%s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------------ 1) fly ---
export PATH="$HOME/.fly/bin:$PATH"   # إن كانت مثبّتة بالفعل

find_fly() {
  for c in fly flyctl "$HOME/.fly/bin/fly" "$HOME/.fly/bin/flyctl"; do
    if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then echo "$c"; return 0; fi
  done
  return 1
}

if ! FLY="$(find_fly)"; then
  say "تثبيت أداة fly تلقائيًا (مرة واحدة، ~40MB)…"
  INSTALLED=0
  for attempt in 1 2 3; do
    if curl -fsSL "${FLY_INSTALL_URL:-https://fly.io/install.sh}" | bash; then INSTALLED=1; break; fi
    echo "  ⚠ محاولة التثبيت $attempt لم تكتمل — نعيد المحاولة…"
    sleep 2
  done
  [ "$INSTALLED" = "1" ] || die "فشل تثبيت fly بعد 3 محاولات. جرّب يدويًا: curl -fsSL https://fly.io/install.sh | bash  ثم  export PATH=\$HOME/.fly/bin:\$PATH"
  export FLYCTL_INSTALL="${FLYCTL_INSTALL:-$HOME/.fly}"
  export PATH="$FLYCTL_INSTALL/bin:$PATH"
  FLY="$(find_fly)" || die "تم التثبيت لكن الأمر fly غير موجود. نفّذ: export PATH=\"$HOME/.fly/bin:$PATH\""
fi
echo "✓ fly: $FLY ($("$FLY" version 2>/dev/null | head -1))"

if ! "$FLY" auth whoami >/dev/null 2>&1; then
  say "تسجيل الدخول إلى Fly — سيفتح المتصفح. إن فشل، أنشئ مفتاحًا من:"
  echo "    https://fly.io/user/personal_access_tokens   ثم:  $FLY auth token"
  "$FLY" auth login || die "فشل تسجيل الدخول — جرّب: $FLY auth login   أو: $FLY auth token"
fi
WHO="$("$FLY" auth whoami 2>/dev/null | head -1)"
[ -n "$WHO" ] || die "لم يكتمل تسجيل الدخول — أعد المحاولة: $FLY auth login"
echo "✓ الحساب: $WHO"

# ------------------------------------------------------------- 2) download ---
WORK="$(mktemp -d 2>/dev/null || mktemp -d -t conquest)"
trap 'rm -rf "$WORK"' EXIT
say "تنزيل مجلد conquest (فرع $BRANCH)…"

SRC=""
# نجرّب أكثر من طريقة: git الحديث، ثم git العادي، ثم أرشيف tar، ثم ملفات raw.
ok_src() {
  [ -n "$1" ] || return 1
  for f in server.js fly.toml index.html styles.css js/main.js js/core.js js/state.js js/net.js \
           js/render.js js/world.js js/data.js js/rng.js js/audio.js js/campaigns.js \
           data/world.json data/world-data.js media/hero.jpg; do
    [ -s "$1/$f" ] || return 1
  done
  return 0
}

# (1) git مع partial clone — ينزّل مجلد conquest فقط (2.3MB)
if command -v git >/dev/null 2>&1 && [ "${NO_GIT:-0}" != "1" ]; then
  if git clone --depth 1 --no-checkout --filter=blob:none -b "$BRANCH" \
       "https://github.com/$REPO_SLUG.git" "$WORK/git" >/dev/null 2>&1 \
     && git -C "$WORK/git" checkout HEAD -- conquest >/dev/null 2>&1 \
     && ok_src "$WORK/git/conquest"; then
    SRC="$WORK/git/conquest"
    echo "  ✓ عبر git (partial clone)"
  fi
fi

# (2) أرشيف tar من GitHub — لا يعتمد على إعدادات git المحلية إطلاقًا
if [ -z "$SRC" ]; then
  mkdir -p "$WORK/tar"
  if curl -fsSL "https://codeload.github.com/$REPO_SLUG/tar.gz/refs/heads/$BRANCH" \
       | tar xz -C "$WORK/tar" --strip-components=1 2>/dev/null \
     && ok_src "$WORK/tar/conquest"; then
    SRC="$WORK/tar/conquest"
    echo "  ✓ عبر أرشيف tar"
  fi
fi

# (3) آخر حل: واجهة GitHub API (لا تعتمد على raw.githubusercontent أبدًا).
#     نأخذ شجرة الملفات ثم ننزّل كل ملف كـ blob (base64) ونفكّه.
if [ -z "$SRC" ]; then
  mkdir -p "$WORK/api/conquest"
  TREE="$WORK/tree.json"
  if curl -fsSL "https://api.github.com/repos/$REPO_SLUG/git/trees/$BRANCH?recursive=1" -o "$TREE" 2>/dev/null \
     || curl -fsSL "https://api.github.com/repos/$REPO_SLUG/git/trees/$BRANCH?recursive=1" \
        -H "Authorization: Bearer ${GITHUB_TOKEN:-}" -o "$TREE" 2>/dev/null; then
    # قائمة "مسار|رابط الـblob" لكل ملفات conquest
    python3 - "$TREE" "$WORK/listing.txt" <<'PYEOF' 2>/dev/null || true
import json, sys
tree = json.load(open(sys.argv[1]))
with open(sys.argv[2], "w") as out:
    for e in tree.get("tree", []):
        p = e.get("path", "")
        if e.get("type") == "blob" and p.startswith("conquest/") \
           and not p.startswith(("conquest/deploy/", "conquest/scripts/")):
            if e.get("size", 0) > 40 * 1024 * 1024:   # حماية من أي ملف ضخم
                continue
            out.write(p[len("conquest/"):] + "|" + e.get("url", "") + "\n")
PYEOF
    if [ -s "$WORK/listing.txt" ]; then
      while IFS='|' read -r rel url; do
        [ -n "$rel" ] || continue
        mkdir -p "$WORK/api/conquest/$(dirname "$rel")"
        curl -fsSL "$url" -H "Accept: application/vnd.github.raw" \
             -H "Authorization: Bearer ${GITHUB_TOKEN:-}" \
             -o "$WORK/api/conquest/$rel" 2>/dev/null || true
      done < "$WORK/listing.txt"
    fi
  fi
  if ok_src "$WORK/api/conquest"; then
    SRC="$WORK/api/conquest"
    echo "  ✓ عبر GitHub API ($(find "$SRC" -type f | wc -l | tr -d ' ') ملف)"
  fi
fi

# (4) وأخيرًا: raw.githubusercontent (قد يكون محجوبًا في بعض الشبكات)
if [ -z "$SRC" ]; then
  base="https://raw.githubusercontent.com/$REPO_SLUG/$BRANCH/conquest"
  mkdir -p "$WORK/raw/conquest"
  for f in index.html styles.css server.js package.json fly.toml Dockerfile start.sh .dockerignore media/hero.jpg; do
    mkdir -p "$WORK/raw/conquest/$(dirname "$f")"
    curl -fsSL "$base/$f" -o "$WORK/raw/conquest/$f" 2>/dev/null || true
  done
  for f in js/main.js js/core.js js/state.js js/net.js js/data.js js/audio.js js/campaigns.js js/rng.js js/render.js js/world.js data/world.json; do
    mkdir -p "$WORK/raw/conquest/$(dirname "$f")"
    curl -fsSL "$base/$f" -o "$WORK/raw/conquest/$f" 2>/dev/null || true
  done
  if ok_src "$WORK/raw/conquest"; then
    SRC="$WORK/raw/conquest"
    echo "  ✓ عبر raw.githubusercontent"
  fi
fi

[ -n "$SRC" ] || die "تعذّر تنزيل الملفات — تحقّق من الإنترنت ثم أعد المحاولة"
echo "✓ الملفات جاهزة: $(du -sh "$SRC" | cut -f1) — $(find "$SRC" -type f | wc -l | tr -d ' ') ملف"

# ------------------------------------------------------------ 3) app name ---
say "اسم التطبيق: $APP"
tmp="$SRC/fly.toml.new"
awk -v n="$APP" '/^app[[:space:]]*=/{print "app = \"" n "\""; next} {print}' "$SRC/fly.toml" > "$tmp" && mv "$tmp" "$SRC/fly.toml"

cd "$SRC" || die "تعذّر الدخول إلى مجلد اللعبة"

# --------------------------------------------------------------- 4) deploy ---
exists() { "$FLY" apps list 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx "$APP"; }

if exists; then
  say "التطبيق موجود — تحديث النشر…"
  "$FLY" deploy --yes || die "فشل النشر (افتح: $FLY logs)"
else
  say "إنشاء التطبيق أول مرة في منطقة $REGION…"
  "$FLY" launch --copy-config --no-deploy --name "$APP" --region "$REGION" </dev/null \
    || die "فشل إنشاء التطبيق — جرّب اسمًا آخر بالإنجليزية: APP=conquest-khalil bash publish.sh"
  say "بناء الصورة ونشرها…"
  "$FLY" deploy --yes || die "فشل النشر (افتح: $FLY logs)"
fi

URL="https://$APP.fly.dev"
say "تم النشر ✅"
echo "  اللعبة + الأونلاين: $URL"
echo "  فحص الصحة:        $URL/health"
echo
echo "  لمتابعة الغرف:    $FLY logs"
echo "  لحالة الماشين:    $FLY status"
"$FLY" open >/dev/null 2>&1 || true
