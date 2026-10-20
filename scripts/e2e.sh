#!/usr/bin/env bash
# Reinicia la pila local con datos vacíos, crea las cuentas de prueba y ejecuta el recorrido E2E.
set -euo pipefail
cd "$(dirname "$0")/.."
export OUT_DIR=${OUT_DIR:-/tmp/mlsupply-stack}
bash scripts/test-stack/up.sh >/dev/null
STACK_KEYS="$OUT_DIR/keys.env" node tests/e2e/seed-users.mjs >/dev/null
npx playwright test "$@"
