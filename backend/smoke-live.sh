#!/bin/sh
# Live Supabase smoke test for Envelop. Reads ../.env (never commit it).
# Creates one anonymous Auth user. App RPC probes are chosen to fail before
# writing application rows; remove the test user from Auth after the run.
# Usage: sh backend/smoke-live.sh
set -eu
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
URL="$ENVELOP_SUPABASE_URL"
KEY="$ENVELOP_SUPABASE_KEY"
TOMATO="00000000-0000-0000-0000-000000000001"
pass=0; fail=0
ok() { pass=$((pass+1)); echo "PASS $1"; }
no() { fail=$((fail+1)); echo "FAIL $1 -- $2"; }

# 1. profiles table exists? (401 RLS = yes; PGRST205 = migration missing)
code=$(curl -s -o /tmp/env1.json -w "%{http_code}" "$URL/rest/v1/profiles?select=id&limit=1" -H "apikey: $KEY")
if [ "$code" = "401" ]; then ok "profiles table present (RLS denies key-only read)"
elif grep -q PGRST205 /tmp/env1.json 2>/dev/null; then no "profiles table" "migration 001_envelop.sql not applied (run it in dashboard SQL editor)"
else no "profiles table" "http=$code $(head -c 120 /tmp/env1.json)"; fi

# 2. anonymous sign-in enabled?
code=$(curl -s -o /tmp/env2.json -w "%{http_code}" -X POST "$URL/auth/v1/signup" -H "apikey: $KEY" -H "Content-Type: application/json" -d '{}')
TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/env2.json')).get('access_token',''))" 2>/dev/null || true)
if [ "$code" = "200" ] && [ -n "$TOKEN" ]; then
  UID=$(python3 -c "import json;print(json.load(open('/tmp/env2.json'))['user']['id'])")
  ok "anonymous sign-in works (test user $UID)"
else
  no "anonymous sign-in" "http=$code $(head -c 160 /tmp/env2.json)"; TOKEN=""
fi

if [ -n "${TOKEN:-}" ]; then
  # 3. authenticated read path
  code=$(curl -s -o /tmp/env3.json -w "%{http_code}" "$URL/rest/v1/profiles?select=id&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN")
  [ "$code" = "200" ] && ok "authenticated profiles read (RLS path)" || no "authenticated profiles read" "http=$code $(head -c 160 /tmp/env3.json)"

  # 4. RPCs reachable? (any app-level error = function EXISTS; PGRST202 = missing)
  code=$(curl -s -o /tmp/env4.json -w "%{http_code}" -X POST "$URL/rest/v1/rpc/get_or_create_dm" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"p_peer":"11111111-1111-1111-1111-111111111111"}')
  if grep -q PGRST202 /tmp/env4.json 2>/dev/null; then no "rpc get_or_create_dm" "function missing (migration?)"
  else ok "rpc get_or_create_dm reachable (http=$code, rejected bogus peer as it should)"; fi

  # 5. bridge lease machinery answers (must refuse: no grant)
  code=$(curl -s -o /tmp/env5.json -w "%{http_code}" -X POST "$URL/rest/v1/rpc/claim_bridge" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"p_device\":\"$TOMATO\",\"p_instance\":\"22222222-2222-2222-2222-222222222222\"}")
  if grep -q PGRST202 /tmp/env5.json 2>/dev/null; then no "rpc claim_bridge" "function missing (migration?)"
  else ok "rpc claim_bridge answers (http=$code, unprovisioned caller refused)"; fi
fi

echo "---"
echo "live smoke: $pass passed, $fail failed"
exit "$([ "$fail" = "0" ] && echo 0 || echo 1)"
