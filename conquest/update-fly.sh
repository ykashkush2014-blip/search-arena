#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  تحديث conquest-online-8129.fly.dev  —  أمر واحد، بلا إعداد مسبق.
#
#      bash conquest/update-fly.sh
#
#  ماذا يفعل؟
#    1) يتأكد من flyctl (يثبّتها إن لزم) ويسجّل الدخول.
#    2) ينزّل آخر نسخة من مجلد conquest فقط (أرشيف GitHub — بلا git).
#    3) ينشر على نفس التطبيق conquest-online-8129 (لا تطبيق جديد).
#    4) يتحقق أن الإصدار المباشر مطابق للفرع، ويطبع النتيجة.
#
#  متغيّرات اختيارية:
#    APP=conquest-online-8129   اسم التطبيق المستهدف
#    BRANCH=arena/...           الفرع (الافتراضي هو فرع التطوير الحالي)
#    REGION=fra                 منطقة الإنشاء لو لم يكن التطبيق موجودًا
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail
VERSION="2026-11-22.2"

REPO_SLUG="${REPO_SLUG:-ykashkush2014-blip/search-arena}"
BRANCH="${BRANCH:-arena/07357b19-search-arena}"
APP="${APP:-conquest-online-8129}"
REGION="${REGION:-fra}"

say() { printf '\n\033[1;33m%s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
printf 'تحديث CONQUEST على Fly — إصدار %s\n' "$VERSION"
printf 'التطبيق: %s   الفرع: %s\n' "$APP" "$BRANCH"

# ---- 1) flyctl ------------------------------------------------------------
export PATH="$HOME/.fly/bin:$PATH"
find_fly() {
  for c in fly flyctl "$HOME/.fly/bin/fly" "$HOME/.fly/bin/flyctl"; do
    if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then echo "$c"; return 0; fi
  done
  return 1
}
if ! FLY="$(find_fly)"; then
  say "تثبيت flyctl (مرة واحدة فقط)…"
  for attempt in 1 2 3; do
    if curl -fsSL https://fly.io/install.sh | bash; then break; fi
    echo "  ⚠ محاولة $attempt لم تكتمل، نعيد…"; sleep 2
  done
  export PATH="$HOME/.fly/bin:$PATH"
  FLY="$(find_fly)" || die "تعذّر تثبيت flyctl. جرّب يدويًا: curl -fsSL https://fly.io/install.sh | bash"
fi
echo "✓ flyctl: $("$FLY" version 2>/dev/null | head -1)"

if ! "$FLY" auth whoami >/dev/null 2>&1; then
  say "تسجيل الدخول إلى Fly (سيفتح المتصفح)…"
  "$FLY" auth login || die "فشل تسجيل الدخول. بديل: fly auth token ثم الصق المفتاح."
fi
echo "✓ الحساب: $("$FLY" auth whoami 2>/dev/null | head -1)"

# ---- 2) نزّل آخر نسخة من مجلد conquest --------------------------------------
WORK="$(mktemp -d 2>/dev/null || mktemp -d -t conquest)"
trap 'rm -rf "$WORK"' EXIT
say "تنزيل آخر نسخة (فرع $BRANCH)…"

SRC=""
SHA=""
# الأرشيف أولًا: لا يحتاج git، ولا يفتح نافذة مصادقة مخفية.
# على macOS يتوقف `git clone` لمستودع عام عند سؤال Keychain لا يظهر حين تكون
# المخرجات محوّلة إلى ملف — فيبدو السكربت معلّقًا عند التنزيل. حدث هذا فعلًا.
mkdir -p "$WORK/t"
if curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 20 -m 300 \
     "https://codeload.github.com/$REPO_SLUG/tar.gz/refs/heads/$BRANCH" \
     | tar xz -C "$WORK/t" --strip-components=1 2>/dev/null; then
  SRC="$WORK/t/conquest"
  echo "  ✓ عبر أرشيف GitHub"
fi
# git احتياطي فقط: بلا أي تفاعل، لأنه لا يستطيع التوقف لأجل كلمة مرور.
if [ -z "$SRC" ] && command -v git >/dev/null 2>&1; then
  echo "  ⚠ الأرشيف لم ينجح — أحاول git…"
  if GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/true git -c credential.helper= \
       clone --depth 1 --single-branch -b "$BRANCH" \
       "https://github.com/$REPO_SLUG.git" "$WORK/g" >"$WORK/g.log" 2>&1; then
    SRC="$WORK/g/conquest"
    SHA="$(git -C "$WORK/g" rev-parse HEAD 2>/dev/null || true)"
    echo "  ✓ عبر git"
  fi
fi
[ -n "$SRC" ] && [ -f "$SRC/server.js" ] || die "تعذّر تنزيل ملفات اللعبة — تحقق من الإنترنت وأعد المحاولة"

# الإصدار المستهدف: من GitHub API مباشرة (يعمل بلا git).
if [ -z "$SHA" ]; then
  SHA="$(curl -fsSL --connect-timeout 15 -m 40 \
    "https://api.github.com/repos/$REPO_SLUG/commits/$BRANCH" 2>/dev/null \
    | tr ',{' '\n\n' | sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([a-f0-9]\{40\}\).*/\1/p' | head -1)"
fi
[ -n "$SHA" ] && echo "  ✓ الإصدار المستهدف: ${SHA:0:7}" || echo "  ⚠ تعذّر تحديد الإصدار (سننشر بلا بصمة)"

# ---- 3) انشر على نفس التطبيق ------------------------------------------------
cd "$SRC" || die "تعذّر الدخول لمجلد اللعبة"
awk -v n="$APP" '/^app[[:space:]]*=/{print "app = \"" n "\""; next} {print}' fly.toml > fly.toml.new \
  && mv fly.toml.new fly.toml

if "$FLY" apps list 2>/dev/null | awk 'NR>1{print $1}' | grep -qx "$APP"; then
  say "التطبيق موجود — نشر التحديث…"
  "$FLY" deploy --build-arg "GIT_SHA=${SHA:-dev}" --yes || die "فشل النشر. راجع: fly logs -a $APP"
else
  say "التطبيق غير موجود — إنشاؤه أول مرة…"
  "$FLY" launch --copy-config --no-deploy --name "$APP" --region "$REGION" </dev/null \
    || "$FLY" apps create "$APP" || die "تعذّر إنشاء التطبيق"
  "$FLY" deploy --build-arg "GIT_SHA=${SHA:-dev}" --yes || die "فشل النشر. راجع: fly logs -a $APP"
fi

# ---- 4) تحقّق ---------------------------------------------------------------
URL="https://$APP.fly.dev"
say "التحقّق من الموقع…"
OK=0
for i in $(seq 1 12); do
  body="$(curl -fsS -m 10 "$URL/health" 2>/dev/null || true)"
  case "$body" in
    *'"ok":true'*) OK=1; echo "  ✓ /health: $body"; break ;;
  esac
  printf '  … انتظار (%s/12)\n' "$i"; sleep 6
done
if [ "$OK" != "1" ]; then
  printf '\n\033[1;31m✗ النشر تم لكن الموقع لم يستجب بعد.\033[0m\n' >&2
  cat >&2 <<HINT
  هذا يحدث غالبًا لأحد سببين:
   1) الحساب على خطة مجانية بلا طريقة دفع على الملف — Fly لا تشغّل الماشين حينها.
      الحل: https://fly.io/dashboard  ← أضف بطاقة (لن تُخصم في الخطة المجانية)
   2) الماشين بدأت للتوّ وتحتاج دقيقة.
  افحص:   fly status -a $APP
          fly logs   -a $APP --no-tail
  ثم تحقّق يدويًا:
          curl -s https://$APP.fly.dev/health
HINT
  exit 1
fi

if [ -n "$SHA" ]; then
  got="$(printf '%s' "$body" | sed -n 's/.*"build":"\([^"]*\)".*/\1/p')"
  want="$(printf '%s' "$SHA" | cut -c1-12)"
  if [ "$got" = "$want" ]; then
    echo "  ✓ الإصدار المباشر = $got  (مطابق للفرع — التحديث نجح)"
  else
    echo "  ⚠ الإصدار المباشر \"$got\" ≠ المتوقع \"$want\"."
    echo "    قد يكون النشر القديم ما زال يعمل. تحقّق بعد دقيقة:"
    echo "    curl -s $URL/health"
  fi
fi

say "تم ✅"
echo "  اللعبة + الأونلاين: $URL"
echo "  السجلّات:           $FLY logs -a $APP"
