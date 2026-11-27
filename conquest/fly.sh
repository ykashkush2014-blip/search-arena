#!/usr/bin/env bash
# CONQUEST — نشر الأونلاين على Fly.io بأمر واحد.
#
#   ./fly.sh          → ينشر (أو يحدّث) ثم يفتح الرابط
#   ./fly.sh logs     → يتابع سجلّ الغرف
#   ./fly.sh status   → حالة الماشين والصحة
#
# المتطلبات: حساب Fly + `fly auth login` مرة واحدة.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v fly >/dev/null 2>&1 && ! command -v flyctl >/dev/null 2>&1; then
  echo "✗ أداة fly غير مثبّتة. ثبّتها بأمر:"
  echo "    curl -L https://fly.io/install.sh | sh"
  exit 1
fi
FLY="$(command -v fly || command -v flyctl)"

case "${1:-deploy}" in
  deploy)
    "$FLY" deploy
    echo
    "$FLY" open
    ;;
  logs)   "$FLY" logs ;;
  status) "$FLY" status; echo; "$FLY" checks list 2>/dev/null || true ;;
  *)
    echo "الاستخدام: ./fly.sh [deploy|logs|status]"
    exit 1
    ;;
esac
