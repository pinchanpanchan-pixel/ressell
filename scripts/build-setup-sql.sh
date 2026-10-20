#!/usr/bin/env bash
# Une todas las migraciones en supabase/setup.sql para pegarlo en el SQL Editor de Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
{
  echo "-- ML Supply · Instalación completa (generado desde supabase/migrations). Ejecutar UNA sola vez."
  echo "begin;"
  for f in supabase/migrations/*.sql; do echo; echo "-- ===== $(basename "$f") ====="; cat "$f"; done
  echo; echo "commit;"
} > supabase/setup.sql
echo "supabase/setup.sql generado"
