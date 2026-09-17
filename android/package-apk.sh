#!/bin/sh
# Build Tyrone's private bridge + chat APK. The output stays gitignored.
set -eu
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
VERSION="${ENVELOP_VERSION:-0.2.0}"
OUT_DIR="${ENVELOP_ANDROID_OUT:-$ROOT/android/private-builds}"
APK_NAME="envelop-private-${VERSION}.apk"

# Gradle 8.11.1 and the current Android plugin must run on JDK 17.
if [ -z "${JAVA_HOME:-}" ]; then
  if [ -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]; then
    JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
  elif [ -x /usr/libexec/java_home ] && JDK17=$(/usr/libexec/java_home -v 17 2>/dev/null); then
    JAVA_HOME=$JDK17
  fi
  export JAVA_HOME
fi
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "JDK 17 is required. Set JAVA_HOME to a JDK 17 installation." >&2
  exit 1
fi
JAVA_VERSION=$("$JAVA_HOME/bin/java" -XshowSettings:properties -version 2>&1 |
  awk -F= '/java.specification.version/ { gsub(/[[:space:]]/, "", $2); print $2; exit }')
if [ "$JAVA_VERSION" != "17" ]; then
  echo "JDK 17 is required; JAVA_HOME currently selects Java $JAVA_VERSION." >&2
  exit 1
fi
export PATH="$JAVA_HOME/bin:$PATH"

if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi

if [ ! -x ./gradlew ]; then
  echo "Missing ./gradlew — generate the Gradle wrapper first." >&2
  exit 1
fi

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

if [ -n "${ANDROID_HOME:-}" ] && [ ! -f local.properties ]; then
  printf 'sdk.dir=%s\n' "$ANDROID_HOME" > local.properties
fi

# Prefer debug APK (signed with debug keystore) so sideload works without a release keystore.
./gradlew :bridge:assembleDebug \
  -Penvelop.url="$URL" \
  -Penvelop.key="$KEY" \
  --no-daemon

mkdir -p "$OUT_DIR"
APK="bridge/build/outputs/apk/debug/bridge-debug.apk"
if [ ! -f "$APK" ]; then
  echo "Expected APK missing: $APK" >&2
  exit 1
fi
cp "$APK" "$OUT_DIR/$APK_NAME"
printf 'Wrote private APK %s (%s bytes)\n' "$OUT_DIR/$APK_NAME" "$(wc -c < "$OUT_DIR/$APK_NAME" | tr -d ' ')"
