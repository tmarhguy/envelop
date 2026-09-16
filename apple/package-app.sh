#!/bin/sh
set -eu
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
VERSION="${ENVELOP_VERSION:-0.2.0}"
OUT_DIR="${ENVELOP_APPLE_OUT:-$ROOT/apple/private-builds}"
APP_DIR="$OUT_DIR/Envelop.app"
ZIP_NAME="envelop-mac-${VERSION}.zip"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

swift build --disable-sandbox
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
cp .build/debug/Envelop "$APP_DIR/Contents/MacOS/Envelop"
cp mac/Info.plist "$APP_DIR/Contents/Info.plist"
# Optional client configuration; never supply a service-role key.
python3 - "$APP_DIR/Contents/Info.plist" <<'PY'
import os, plistlib
import sys
path = sys.argv[1]
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
ditto -c -k --sequesterRsrc --keepParent "$APP_DIR" "$OUT_DIR/$ZIP_NAME"
printf 'Built private app %s and archive %s (%s bytes)\n' "$APP_DIR" "$OUT_DIR/$ZIP_NAME" "$(wc -c < "$OUT_DIR/$ZIP_NAME" | tr -d ' ')"
