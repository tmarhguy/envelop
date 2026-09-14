#!/bin/sh
set -eu
cd "$(dirname "$0")"
swift build --disable-sandbox
mkdir -p Envelop.app/Contents/MacOS
cp .build/debug/Envelop Envelop.app/Contents/MacOS/Envelop
cp mac/Info.plist Envelop.app/Contents/Info.plist
# Optional public client configuration; never supply a service-role key.
python3 - <<'PY'
import os, plistlib
path = 'Envelop.app/Contents/Info.plist'
with open(path, 'rb') as f:
    info = plistlib.load(f)
for env, key in [('ENVELOP_SUPABASE_URL', 'EnvelopSupabaseURL'), ('ENVELOP_SUPABASE_KEY', 'EnvelopSupabaseKey')]:
    if os.environ.get(env):
        info[key] = os.environ[env]
with open(path, 'wb') as f:
    plistlib.dump(info, f)
PY
printf '%s\n' 'Built apple/Envelop.app. Open the bundle to run Envelop.'
