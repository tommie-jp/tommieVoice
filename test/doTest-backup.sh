#!/bin/bash
# バックアップと復元のリハーサル（この PC の開発用 DB コンテナで実行）
# Usage: ./test/doTest-backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

GREEN=$'\e[32m'; RED=$'\e[31m'; RESET=$'\e[0m'
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

docker compose up -d --wait db >/dev/null
PSQL=(docker compose exec -T db psql -U tommievoice -v ON_ERROR_STOP=1 -tA)

echo "━━━ 1. 準備（開発 DB にデータがあること） ━━━"
TABLES="topics threads posts reports"
count_all() {
    local db="$1" out=""
    for t in $TABLES; do out+="$t=$("${PSQL[@]}" -d "$db" -c "SELECT count(*) FROM $t") "; done
    echo "$out"
}
BEFORE=$(count_all tommievoice)
echo "  元: $BEFORE"

echo "━━━ 2. バックアップ ━━━"
mkdir -p data/audio
BACKUP_COMPOSE="docker compose" ./deploy/backup.sh --dest "$WORK" --keep-days 14
DUMP=$(ls "$WORK"/db-*.dump | head -1)
[ -L "$WORK/audio-latest" ] && echo "  ✅ audio-latest"

echo "━━━ 3. 別 DB に復元 ━━━"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS tommievoice_restore WITH (FORCE)" >/dev/null
"${PSQL[@]}" -d postgres -c "CREATE DATABASE tommievoice_restore" >/dev/null
docker compose exec -T db pg_restore -U tommievoice -d tommievoice_restore --no-owner < "$DUMP"
AFTER=$(count_all tommievoice_restore)
echo "  復元: $AFTER"
"${PSQL[@]}" -d postgres -c "DROP DATABASE tommievoice_restore WITH (FORCE)" >/dev/null

if [ "$BEFORE" = "$AFTER" ]; then
    echo "${GREEN}━━━ PASS: 行数が一致しました ━━━${RESET}"
else
    echo "${RED}━━━ FAIL: 行数が一致しません ━━━${RESET}"
    exit 1
fi
