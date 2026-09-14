#!/bin/sh
set -eu
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
VERSION="${ENVELOP_VERSION:-0.2.0}"
OUT_DIR="$ROOT/website/downloads"
ZIP_NAME="envelop-mac-${VERSION}.zip"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

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

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/$ZIP_NAME"
ditto -c -k --sequesterRsrc --keepParent Envelop.app "$OUT_DIR/$ZIP_NAME"
printf 'Built apple/Envelop.app and %s (%s bytes)\n' "$OUT_DIR/$ZIP_NAME" "$(wc -c < "$OUT_DIR/$ZIP_NAME" | tr -d ' ')"
