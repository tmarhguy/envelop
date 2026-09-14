#!/bin/sh
# Zip apple/ sources for Xcode + optional IPA for AltStore/SideStore.
set -eu
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
VERSION="${ENVELOP_VERSION:-0.2.0}"
OUT_DIR="$ROOT/website/downloads"
SOURCE_ZIP="envelop-apple-source.zip"
IPA_NAME="envelop-ios-${VERSION}.ipa"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

# Bake publishable network into Apple Info.plist files before packaging (name-only launch from source).
for PLIST in ios/Info.plist mac/Info.plist; do
  if [ -n "${ENVELOP_SUPABASE_URL:-}" ] && [ -n "${ENVELOP_SUPABASE_KEY:-}" ] && [ -f "$PLIST" ]; then
    /usr/libexec/PlistBuddy -c "Delete :EnvelopSupabaseURL" "$PLIST" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Delete :EnvelopSupabaseKey" "$PLIST" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Add :EnvelopSupabaseURL string ${ENVELOP_SUPABASE_URL}" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :EnvelopSupabaseKey string ${ENVELOP_SUPABASE_KEY}" "$PLIST"
  fi
done

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/$SOURCE_ZIP"
# Exclude build products and local app bundles from the source archive.
(
  cd "$ROOT"
  zip -qr "$OUT_DIR/$SOURCE_ZIP" apple \
    -x 'apple/.build/*' \
    -x 'apple/Envelop.app/*' \
    -x 'apple/**/.DS_Store' \
    -x 'apple/DerivedData/*' \
    -x 'apple/*.xcuserdata/*'
)
printf 'Wrote %s (%s bytes)\n' "$OUT_DIR/$SOURCE_ZIP" "$(wc -c < "$OUT_DIR/$SOURCE_ZIP" | tr -d ' ')"

# Best-effort IPA via xcodebuild (requires a signing team + iOS platform). Failure is non-fatal.
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild not found; skipping IPA."
  exit 0
fi

SCHEME="${ENVELOP_IOS_SCHEME:-Envelop}"
PROJECT="Envelop.xcodeproj"
ARCHIVE_PATH="$(pwd)/.build/Envelop.xcarchive"
EXPORT_PATH="$(pwd)/.build/ipa-export"
EXPORT_PLIST="$(pwd)/.build/ExportOptions.plist"

mkdir -p .build
cat > "$EXPORT_PLIST" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>development</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>compileBitcode</key>
  <false/>
</dict>
</plist>
PLIST

set +e
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  CODE_SIGN_STYLE=Automatic \
  archive
ARCHIVE_STATUS=$?
set -e

if [ "$ARCHIVE_STATUS" -ne 0 ] || [ ! -d "$ARCHIVE_PATH" ]; then
  echo "IPA archive skipped (signing or iOS platform unavailable). Source zip is ready for AltStore tooling / Xcode."
  exit 0
fi

rm -rf "$EXPORT_PATH"
set +e
xcodebuild -exportArchive -archivePath "$ARCHIVE_PATH" -exportPath "$EXPORT_PATH" -exportOptionsPlist "$EXPORT_PLIST"
EXPORT_STATUS=$?
set -e

IPA="$(find "$EXPORT_PATH" -name '*.ipa' 2>/dev/null | head -1 || true)"
if [ "$EXPORT_STATUS" -eq 0 ] && [ -n "$IPA" ] && [ -f "$IPA" ]; then
  cp "$IPA" "$OUT_DIR/$IPA_NAME"
  printf 'Wrote %s (%s bytes)\n' "$OUT_DIR/$IPA_NAME" "$(wc -c < "$OUT_DIR/$IPA_NAME" | tr -d ' ')"
else
  echo "IPA export skipped; source zip is ready for Xcode / AltStore tooling."
fi
