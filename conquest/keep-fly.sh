#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  CONQUEST — تشغيل سيرفر Fly.io وإبقاؤه لا ينطفئ
#
#      bash conquest/keep-fly.sh              # أبقِه حيًّا الآن (مراقب كل 30ث)
#      bash conquest/keep-fly.sh --watch      # نفس الشيء، لكن بمخرجات مباشرة
#      bash conquest/keep-fly.sh --fix        # اضبط الإعدادات فقط ثم اخرج
#      bash conquest/keep-fly.sh --status     # اطبع الحالة الحالية فقط
#
#  ما الذي يُبقي الخادم حيًّا فعلًا؟ ثلاث طبقات، وكلها مطلوبة:
#
#   (1) إعدادات الماشينة — ألّا يُوقفها Fly من نفسه:
#         auto_stop_machines = false     ← موجود في fly.toml
#         min_machines_running = 1       ← موجود في fly.toml
#       لكن auto_stop_machines يعود إلى true تلقائيًا إذا لم يكن مضبوطًا في
#       fly.toml، وكذلك إذا كان الإعداد على مستوى الخدمة مختلفًا. لذلك نفرضه
#       بالأمر الصريح في كل مرة — الإعداد المؤقت لا يُحفظ.
#
#   (2) وجود ماشينة واحدة على الأقل: إن اختفت (OOM أو خطأ نشر) نعيد إنشاءها
#       من نفس الصورة، بلا إعادة بناء.
#
#   (3) إبقاء الطلب حيًّا (HTTP ping) — يمنع أي proxy أو DNS أو خطة مجانية من
#       اعتبار التطبيق خاملًا. الفحص مرة كل 30 ثانية مسموح به في خطة Fly.
#
#  متغيّرات اختيارية:
#    APP=conquest-online-8129    اسم التطبيق
#    INTERVAL=30                 ثواني بين كل فحص
#    REGION=fra                  المنطقة لو احتجنا إعادة إنشاء الماشينة
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

APP="${APP:-conquest-online-8129}"
REGION="${REGION:-fra}"
INTERVAL="${INTERVAL:-30}"
# يمكن تغيير العنوان للاختبار المحلي:  URL=http://127.0.0.1:8080 bash keep-fly.sh --status
URL="${URL:-https://$APP.fly.dev}"

# --- ألوان فقط لو كان الطرفية حقيقية -----------------------------------------
if [ -t 1 ]; then
  Y=$'\033[1;33m'; G=$'\033[1;32m'; R=$'\033[1;31m'; DIM=$'\033[2m'; N=$'\033[0m'
else
  Y=""; G=""; R=""; DIM=""; N=""
fi
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✓%s %s\n' "$G" "$N" "$*"; }
bad()  { printf '%s✗%s %s\n' "$R" "$N" "$*" >&2; }
dim()  { printf '%s%s%s\n' "$DIM" "$*" "$N"; }

usage() {
  cat <<USAGE
الاستخدام: bash conquest/keep-fly.sh [--watch|--fix|--status]

  (بلا خيار)  اضبط الإعدادات، اطبع الحالة، ثم راقب دائمًا
  --watch     نفس الشيء مع مخرجات مباشرة
  --fix       اضبط الإعدادات واطبع الحالة ثم اخرج
  --status    اطبع الحالة فقط
  -h, --help  هذه الرسالة

لوحتك على fly:  fly status -a $APP
USAGE
}

case "${1:-}" in
  -h|--help|help) usage; exit 0 ;;
esac

# ---- 1) أداة fly ------------------------------------------------------------
export PATH="$HOME/.fly/bin:$PATH"
find_fly() {
  for c in fly flyctl "$HOME/.fly/bin/fly" "$HOME/.fly/bin/flyctl"; do
    if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then echo "$c"; return 0; fi
  done
  return 1
}
if ! FLY="$(find_fly)"; then
  say "${Y}تثبيت flyctl (مرة واحدة)…${N}"
  curl -fsSL https://fly.io/install.sh | bash || {
    bad "تعذّر تنزيل flyctl (لا اتصال بـ fly.io من هنا)."
    say ""
    say "  على جهازك، ثبّته مرة واحدة:"
    say "    curl -fsSL https://fly.io/install.sh | bash"
    say "    export PATH=\"\$HOME/.fly/bin:\$PATH\""
    say ""
    say "  ثم شغّل هذا السكربت من جديد."
    exit 1
  }
  export PATH="$HOME/.fly/bin:$PATH"
  FLY="$(find_fly)" || { bad "flyctl غير موجود بعد التثبيت"; exit 1; }
fi
ok "flyctl: $("$FLY" version 2>/dev/null | head -1)"

if ! "$FLY" auth whoami >/dev/null 2>&1; then
  say "${Y}تسجيل الدخول إلى Fly…${N}"
  "$FLY" auth login || { bad "فشل تسجيل الدخول"; exit 1; }
fi
ok "الحساب: $("$FLY" auth whoami 2>/dev/null | head -1)"

# ---- أدوات مساعدة -----------------------------------------------------------
# إزالة ألوان ANSI: أداة fly تُلوّن المخرجات، فيفشل أي grep على معرّفات الماشين.
plain() { sed -E $'s/\x1b\\[[0-9;]*m//g'; }

machine_count() {
  local n
  n="$("$FLY" machine list -a "$APP" --json 2>/dev/null |
        grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | wc -l | tr -d ' ')"
  if [ -z "$n" ] || [ "$n" = "0" ]; then
    n="$("$FLY" machine list -a "$APP" 2>/dev/null | plain |
          grep -cE '^[a-zA-Z0-9]{14,}' | tr -d ' ')"
  fi
  printf '%s' "${n:-0}"
}

health() { curl -fsS -m 10 "$URL/health" 2>/dev/null; }

health_ok() { case "$(health)" in *'"ok":true'*) return 0 ;; *) return 1 ;; esac; }

# ---- 2) الإعدادات التي تمنع الإطفاء -----------------------------------------
apply_config() {
  say "${Y}ضبط إعدادات عدم الإطفاء على $APP…${N}"

  # (أ) لا تُوقف Fly الماشينة عند غياب الطلبات. هذا هو السبب الأول والأشهر
  #     لـ"الخادم ينطفئ من نفسه" على Fly: auto_stop_machines الافتراضي true.
  #     ملاحظة: هذا إعداد مؤقت على مستوى الخدمة — أعد تشغيل هذا السكربت بعد
  #     كل نشر، ولهذا يبقى fly.toml هو المرجع الدائم.
  if "$FLY" services update "$APP" --http-service-auto-stop-machines=false >/dev/null 2>&1; then
    ok "auto_stop_machines = false"
  else
    dim "  (تعذّر ضبطه عبر services update — fly.toml يغلّبه أصلًا)"
  fi
  if "$FLY" services update "$APP" --http-service-min-machines-running=1 >/dev/null 2>&1; then
    ok "min_machines_running = 1"
  else
    dim "  (min_machines_running عبر fly.toml)"
  fi

  # (ب) ماشينة واحدة على الأقل. إن لم توجد أي ماشينة (OOM، أو نشر فاشل) نعيد
  #     إنشاءها. الغرف في ذاكرة العملية: ماشينتان = عالمان منفصلان، لذلك نُبقي
  #     العدد 1 لا أكثر.
  local n; n="$(machine_count)"
  if [ "${n:-0}" -eq 0 ]; then
    # اختفت الماشينة تمامًا (حذف، أو نشر فاشل). `scale count 1` يعيد إنشاءها
    # من آخر صورة منشورة، بلا بناء جديد ولا انتظار دقائق.
    bad "لا توجد أي ماشينة — إعادة إنشاء واحدة…"
    "$FLY" scale count 1 --yes --region "$REGION" -a "$APP" >/dev/null 2>&1 ||
      "$FLY" scale count 1 --yes -a "$APP" >/dev/null 2>&1
    sleep 8
    n="$(machine_count)"
    [ "${n:-0}" -ge 1 ] && ok "أُنشئت ماشينة (العدد: $n)" || bad "تعذّر إنشاء ماشينة — راجع: fly status -a $APP"
  elif [ "$n" -gt 1 ]; then
    say "${Y}  ⚠ عدد الماشينات $n — هذا يكسر الأونلاين${N}"
    "$FLY" scale count 1 --yes -a "$APP" >/dev/null 2>&1 &&
      ok "قُلّص العدد إلى 1 (عالم واحد للجميع)" || bad "تعذّر التقليص"
  else
    ok "ماشينة واحدة"
    # الماشينة قد تكون موجودة لكنها متوقفة (OOM، أو إيقاف يدوي): العدد 1 لا
    # يعني أنها تعمل. نطلب حالتها ونشغّلها إن لزم.
    local stopped
    stopped="$("$FLY" machine list -a "$APP" --json 2>/dev/null |
      grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"[^}]*"state"[[:space:]]*:[[:space:]]*"[^"]*"' |
      grep -v '"state"[[:space:]]*:[[:space:]]*"started"' |
      sed -E 's/.*"id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' | tr '\n' ' ')"
    if [ -n "${stopped// /}" ]; then
      say "${Y}  ماشينة متوقفة — تشغيل…${N}"
      for id in $stopped; do
        "$FLY" machine start "$id" -a "$APP" >/dev/null 2>&1 && ok "  ▶ $id" || bad "  تعذّر تشغيل $id"
      done
      sleep 6
    fi
  fi
}

status() {
  say ""
  say "${Y}حالة $APP${N}"
  "$FLY" status -a "$APP" 2>/dev/null | plain | sed 's/^/  /' | head -12
  local body; body="$(health)"
  if [ -n "$body" ]; then ok "  /health: $body"; else bad "  /health لا يستجيب"; fi
  say ""
}

# ---- 3) حلقة الإبقاء --------------------------------------------------------
watch_loop() {
  local fails=0
  say ""
  say "${Y}مراقبة دائمة${N} — كل ${INTERVAL}ث. أوقفها بـ Ctrl-C."
  while true; do
    if health_ok; then
      fails=0
      printf '%s✓ %s%s  %s\n' "$G" "$N" "$(date '+%H:%M:%S')" "$(health | head -c 120)"
    else
      fails=$((fails + 1))
      printf '%s✗ %s غير مستجيب (محاولة %s)%s\n' "$R" "$(date '+%H:%M:%S')" "$fails" "$N"
      if [ "$fails" -ge 3 ]; then
        say "${Y}  ثلاث محاولات فاشلة — إعادة ضبط الماشينة…${N}"
        "$FLY" machine list -a "$APP" --json 2>/dev/null |
          grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' |
          sed -E 's/.*"([^"]+)"$/\1/' |
          while read -r id; do
            "$FLY" machine restart "$id" -a "$APP" >/dev/null 2>&1 && say "  ↻ $id"
          done
        fails=0
        sleep 15
      fi
    fi
    sleep "$INTERVAL"
  done
}

# ---- 4) نقطة الدخول ---------------------------------------------------------
case "${1:-}" in
  --status) status ;;
  --fix)    apply_config; status ;;
  --watch)  apply_config; watch_loop ;;
  ""|--keep)
    apply_config
    status
    watch_loop
    ;;
  *)
    usage
    exit 1
    ;;
esac
