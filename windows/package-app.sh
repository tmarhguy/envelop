#!/bin/sh
# Bake ENVELOP_SUPABASE_* into NetworkDefaults.cs, publish self-contained win-x64, zip for the website.
set -eu
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
VERSION="${ENVELOP_VERSION:-0.2.0}"
OUT_DIR="$ROOT/website/downloads"
ZIP_NAME="envelop-windows-${VERSION}.zip"
DEFAULTS="Envelop/NetworkDefaults.cs"

if ! command -v dotnet >/dev/null 2>&1; then
  if [ -x "$HOME/.dotnet/dotnet" ]; then
    export PATH="$HOME/.dotnet:$PATH"
  else
    echo "dotnet SDK required (https://dotnet.microsoft.com/download)" >&2
    exit 1
  fi
fi

# Load repo .env if present (publishable URL/key only).
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

URL="${ENVELOP_SUPABASE_URL:-}"
KEY="${ENVELOP_SUPABASE_KEY:-}"
if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "Set ENVELOP_SUPABASE_URL and ENVELOP_SUPABASE_KEY (publishable) before packaging." >&2
  exit 1
fi

python3 - "$DEFAULTS" "$URL" "$KEY" <<'PY'
import pathlib, sys
path, url, key = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
def esc(s): return s.replace("\\", "\\\\").replace("\"", "\\\"")
path.write_text(
    "namespace Envelop;\n\n"
    "/// Baked by package-app.sh from ENVELOP_SUPABASE_* (publishable values only).\n"
    "static class NetworkDefaults {\n"
    f'    public const string Url = "{esc(url)}";\n'
    f'    public const string Key = "{esc(key)}";\n'
    "}\n"
)
PY

dotnet publish Envelop/Envelop.csproj -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o .publish

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/$ZIP_NAME"
(
  cd .publish
  zip -qr "$OUT_DIR/$ZIP_NAME" .
)
# Restore empty defaults so secrets/config never linger in source tree.
python3 - "$DEFAULTS" <<'PY'
import pathlib, sys
pathlib.Path(sys.argv[1]).write_text(
    "namespace Envelop;\n\n"
    "/// Baked by package-app.sh from ENVELOP_SUPABASE_* (publishable values only).\n"
    "static class NetworkDefaults {\n"
    '    public const string Url = "";\n'
    '    public const string Key = "";\n'
    "}\n"
)
PY
printf 'Wrote %s (%s bytes)\n' "$OUT_DIR/$ZIP_NAME" "$(wc -c < "$OUT_DIR/$ZIP_NAME" | tr -d ' ')"
