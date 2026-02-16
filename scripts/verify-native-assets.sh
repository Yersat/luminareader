#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DIST_INDEX="$ROOT_DIR/dist/index.html"
IOS_INDEX="$ROOT_DIR/ios/App/App/public/index.html"
ANDROID_INDEX="$ROOT_DIR/android/app/src/main/assets/public/index.html"

for file in "$DIST_INDEX" "$IOS_INDEX" "$ANDROID_INDEX"; do
  if [[ ! -f "$file" ]]; then
    echo "[ERROR] Missing file: $file"
    exit 1
  fi
done

extract_js_asset() {
  local index_file="$1"
  grep -oE 'src="/assets/[^"]+\.js"' "$index_file" | head -n1 | sed -E 's/^src="\/assets\/(.+)"$/\1/'
}

extract_css_asset() {
  local index_file="$1"
  grep -oE 'href="/assets/[^"]+\.css"' "$index_file" | head -n1 | sed -E 's/^href="\/assets\/(.+)"$/\1/'
}

DIST_JS="$(extract_js_asset "$DIST_INDEX")"
DIST_CSS="$(extract_css_asset "$DIST_INDEX")"
IOS_JS="$(extract_js_asset "$IOS_INDEX")"
IOS_CSS="$(extract_css_asset "$IOS_INDEX")"
ANDROID_JS="$(extract_js_asset "$ANDROID_INDEX")"
ANDROID_CSS="$(extract_css_asset "$ANDROID_INDEX")"

if [[ -z "$DIST_JS" || -z "$DIST_CSS" ]]; then
  echo "[ERROR] Could not parse dist assets from $DIST_INDEX"
  exit 1
fi

if [[ -z "$IOS_JS" || -z "$IOS_CSS" ]]; then
  echo "[ERROR] Could not parse iOS assets from $IOS_INDEX"
  exit 1
fi

if [[ -z "$ANDROID_JS" || -z "$ANDROID_CSS" ]]; then
  echo "[ERROR] Could not parse Android assets from $ANDROID_INDEX"
  exit 1
fi

echo "[INFO] Dist    JS: $DIST_JS"
echo "[INFO] Dist   CSS: $DIST_CSS"
echo "[INFO] iOS     JS: $IOS_JS"
echo "[INFO] iOS    CSS: $IOS_CSS"
echo "[INFO] Android JS: $ANDROID_JS"
echo "[INFO] Android CSS: $ANDROID_CSS"

if [[ "$DIST_JS" != "$IOS_JS" || "$DIST_CSS" != "$IOS_CSS" ]]; then
  echo "[ERROR] iOS asset mismatch with dist"
  exit 1
fi

if [[ "$DIST_JS" != "$ANDROID_JS" || "$DIST_CSS" != "$ANDROID_CSS" ]]; then
  echo "[ERROR] Android asset mismatch with dist"
  exit 1
fi

echo "[OK] Native assets match dist bundle for both iOS and Android"
