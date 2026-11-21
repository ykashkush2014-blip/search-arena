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
  curl -fsSL https://fly.io/install.sh | bash || die "فشل تثبيت fly — جرّب يدويًا: curl -fsSL https://fly.io/install.sh | bash"
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

if command -v git >/dev/null 2>&1; then
  git clone --depth 1 --filter=blob:none --sparse -b "$BRANCH" "https://github.com/$REPO_SLUG.git" "$WORK/repo" -q \
    && git -C "$WORK/repo" sparse-checkout set conquest -q \
    && SRC="$WORK/repo/conquest"
else
  base="https://raw.githubusercontent.com/$REPO_SLUG/$BRANCH/conquest"
  mkdir -p "$WORK/repo/conquest"
  for f in index.html styles.css server.js package.json fly.toml Dockerfile start.sh; do
    curl -fsSL "$base/$f" -o "$WORK/repo/conquest/$f" || die "فشل تنزيل $f"
  done
  for d in js data media; do
    (cd "$WORK/repo/conquest" && curl -fsSL "https://github.com/$REPO_SLUG/archive/refs/heads/$BRANCH.tar.gz" \
      | tar xz --strip-components=3 --include='*/conquest/'"$d"'/*' 2>/dev/null) || true
  done
  SRC="$WORK/repo/conquest"
fi
[ -f "$SRC/server.js" ] && [ -f "$SRC/fly.toml" ] || die "لم يكتمل التنزيل"
echo "✓ الملفات جاهزة: $(du -sh "$SRC" | cut -f1)"

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
