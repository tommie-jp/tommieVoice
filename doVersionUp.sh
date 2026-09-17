#!/bin/bash
# shared/appVersion.ts と package.json のバージョン・日付を更新するスクリプト
# Usage: ./doVersionUp.sh [new-version]
#   引数なし: パッチ番号を +1 (例: 0.1.0 → 0.1.1)
#   引数あり: 指定バージョンに更新 (例: ./doVersionUp.sh 0.2.0)
#
# 更新対象:
#   shared/appVersion.ts — APP_VERSION, APP_DATE
#   package.json          — "version"
#
# 更新後「コミットして良いですか？」と確認し、Y なら git commit -m "Ver. <new-version>" を実行
set -euo pipefail
cd "$(dirname "$0")"

APP_VER="shared/appVersion.ts"
PKG="package.json"

show_help() {
    cat <<'EOF'
Usage: ./doVersionUp.sh [new-version]
  引数なし — パッチ番号を +1 (例: 0.1.0 → 0.1.1)
  引数あり — 指定バージョンに更新 (例: ./doVersionUp.sh 0.2.0)

更新対象:
  shared/appVersion.ts — APP_VERSION, APP_DATE (今日の日付)
  package.json          — "version"

更新後「コミットして良いですか？」と確認し、Y なら
  git commit -m "Ver. <new-version>" を実行する。
  pre-commit hook (hooks/pre-commit) が APP_COMMIT_COUNTER を +1 する。

オプション:
  -h, --help    この説明を表示
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    show_help; exit 0
fi
if [ $# -gt 1 ]; then
    show_help >&2; exit 1
fi

if [ ! -f "$APP_VER" ]; then
    echo "❌ $APP_VER がありません" >&2; exit 1
fi

cur_ver=$(grep -oE "APP_VERSION\s*=\s*'[^']+'" "$APP_VER" | grep -oE "'[^']+'" | tr -d "'")

if [ $# -eq 0 ]; then
    major=$(echo "$cur_ver" | cut -d. -f1)
    minor=$(echo "$cur_ver" | cut -d. -f2)
    patch=$(echo "$cur_ver" | cut -d. -f3)
    NEW_VER="${major}.${minor}.$((patch + 1))"
else
    NEW_VER="$1"
fi
NEW_DATE=$(date +"%Y-%m-%d")

if ! [[ "$NEW_VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "❌ バージョンは X.Y.Z 形式で指定してください (例: 0.1.1)" >&2
    exit 1
fi

OLD_PKG_VER=$(grep -oE '"version"\s*:\s*"[^"]+"' "$PKG" | head -1 | grep -oE '"[^"]+"$' | tr -d '"')
OLD_DATE=$(grep -oE "APP_DATE\s*=\s*'[^']+'" "$APP_VER" | grep -oE "'[^']+'" | tr -d "'")

echo "=== バージョン更新 ==="
echo ""
echo "$APP_VER:"
echo "  APP_VERSION: \"$cur_ver\" → \"$NEW_VER\""
echo "  APP_DATE:    \"$OLD_DATE\" → \"$NEW_DATE\""
echo ""
echo "$PKG:"
echo "  version:     \"$OLD_PKG_VER\" → \"$NEW_VER\""
echo ""

sed -i -E "s/(APP_VERSION\s*=\s*')[^']+(')/\1$NEW_VER\2/" "$APP_VER"
sed -i -E "s/(APP_DATE\s*=\s*')[^']+(')/\1$NEW_DATE\2/" "$APP_VER"
sed -i -E "0,/\"version\":\s*\"[^\"]+\"/s//\"version\": \"$NEW_VER\"/" "$PKG"

echo "✅ 更新完了"
echo ""
grep -nE 'APP_VERSION|APP_DATE' "$APP_VER" | head -3
grep -nE '"version"' "$PKG" | head -1
echo ""

read -rp "コミットして良いですか？ [Y/n] " ans
if [[ "$ans" =~ ^[Yy]$ || -z "$ans" ]]; then
    git add "$APP_VER" "$PKG"
    git commit -m "Ver. $NEW_VER"
    echo ""
    echo "✅ コミット完了: Ver. $NEW_VER"
else
    echo "コミットをスキップしました"
fi
