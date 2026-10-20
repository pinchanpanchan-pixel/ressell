#!/usr/bin/env bash
# Levanta la pila de pruebas local: Postgres 16 + GoTrue + PostgREST + pasarela.
set -euo pipefail
cd "$(dirname "$0")"
export JWT_SECRET=super-secret-jwt-token-for-local-tests-only-0123456789
OUT=${OUT_DIR:-/tmp/mlsupply-stack}; mkdir -p "$OUT"
pg_ctlcluster 16 main start 2>/dev/null || true
until pg_isready -h localhost -q; do sleep 0.5; done
su postgres -c "psql -q -c \"alter user postgres password 'testpass'\""
su postgres -c "psql -q -c 'drop database if exists postgres_test'" >/dev/null
# Base de datos limpia en cada arranque
su postgres -c "psql -q -d template1 -c 'select 1'" >/dev/null
docker rm -f mls-gotrue mls-postgrest >/dev/null 2>&1 || true
su postgres -c "psql -q -c 'drop schema if exists auth cascade; drop schema if exists private cascade; drop schema public cascade; create schema public; grant all on schema public to postgres, public;'" 
su postgres -c "psql -q -c \"do \\\$\\\$ begin
  if exists (select 1 from pg_roles where rolname='authenticator') then
    drop owned by supabase_auth_admin cascade; drop owned by anon, authenticated, service_role, authenticator cascade;
    drop role supabase_auth_admin; drop role authenticator; drop role anon; drop role authenticated; drop role service_role;
  end if; end \\\$\\\$;\""
su postgres -c "psql -q -v ON_ERROR_STOP=1 -f bootstrap.sql"
docker run -d --name mls-gotrue --network host \
  -e GOTRUE_API_HOST=127.0.0.1 -e PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 \
  -e GOTRUE_DB_DRIVER=postgres -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:testpass@127.0.0.1:5432/postgres?search_path=auth" \
  -e GOTRUE_SITE_URL=http://localhost:3000 -e GOTRUE_JWT_SECRET=$JWT_SECRET -e GOTRUE_JWT_EXP=3600 \
  -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_DISABLE_SIGNUP=true -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true \
  supabase/gotrue:v2.197.0 >/dev/null
for i in $(seq 1 60); do curl -sf http://127.0.0.1:9999/health >/dev/null && break; sleep 1; done
curl -sf http://127.0.0.1:9999/health >/dev/null || { docker logs mls-gotrue | tail -20; exit 1; }
# Migraciones de la aplicación
for f in ../../supabase/migrations/*.sql; do su postgres -c "psql -q -v ON_ERROR_STOP=1 -f $f"; done
docker run -d --name mls-postgrest --network host \
  -e PGRST_DB_URI=postgres://authenticator:testpass@127.0.0.1:5432/postgres -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET=$JWT_SECRET -e PGRST_SERVER_PORT=3000 -e PGRST_SERVER_HOST=127.0.0.1 \
  postgrest/postgrest:v16.4 >/dev/null
[ -f "$OUT/gateway.pid" ] && kill "$(cat "$OUT/gateway.pid")" 2>/dev/null || true
nohup node "$PWD/gateway.mjs" > "$OUT/gateway.log" 2>&1 &
echo $! > "$OUT/gateway.pid"
node keys.mjs > "$OUT/keys.env"
for i in $(seq 1 30); do curl -sf http://127.0.0.1:3000/ >/dev/null 2>&1 && break; sleep 1; done
echo "Pila lista. Claves en $OUT/keys.env"
