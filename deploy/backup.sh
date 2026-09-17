#!/bin/bash
# tommieVoice の日次バックアップ（VPS1 の APP_DIR で実行。cron 想定）
# Usage: deploy/backup.sh [--dest DIR] [--keep-days N] [--install-cron]
#
# - DB: pg_dump -Fc を db-YYYYmmdd-HHMMSS.dump として保存
# - 音声: data/audio を日付ディレクトリへ rsync（前回分とハードリンクで重複を省く）
# - keep-days より古いものを削除
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${BACKUP_DIR:-$HOME/backups/tommievoice}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
COMPOSE="${BACKUP_COMPOSE:-docker compose -f compose.yml -f compose.prod.yml}"
INSTALL_CRON=false

while [ $# -gt 0 ]; do
    case "$1" in
        --dest) DEST="$2"; shift 2 ;;
        --keep-days) KEEP_DAYS="$2"; shift 2 ;;
        --install-cron) INSTALL_CRON=true; shift ;;
        -h|--help) sed -n 2,9p "$0"; exit 0 ;;
        *) echo "❌ 不明なオプション: $1" >&2; exit 1 ;;
    esac
done
[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || { echo "❌ --keep-days は整数" >&2; exit 1; }

if [ "$INSTALL_CRON" = true ]; then
    LINE="0 4 * * * cd ${APP_DIR} && ./deploy/backup.sh >> ${DEST}/backup.log 2>&1"
    mkdir -p "$DEST"
    if crontab -l 2>/dev/null | grep -qF "deploy/backup.sh"; then
        echo "cron は設定済みです"
    else
        (crontab -l 2>/dev/null; echo "$LINE") | crontab -
        echo "✅ 毎日 4:00 にバックアップします: $LINE"
    fi
    exit 0
fi

cd "$APP_DIR"
umask 077
mkdir -p "$DEST"
TS="$(date +%Y%m%d-%H%M%S)"
echo "[$(date -Is)] backup start → ${DEST}"

# DB（途中で失敗しても壊れたファイルを残さない）
TMP_DUMP="$DEST/.db-$TS.dump.partial"
$COMPOSE exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$TMP_DUMP"
[ -s "$TMP_DUMP" ] || { rm -f "$TMP_DUMP"; echo "❌ pg_dump が空です" >&2; exit 1; }
mv "$TMP_DUMP" "$DEST/db-$TS.dump"
echo "  db:    db-$TS.dump ($(du -h "$DEST/db-$TS.dump" | cut -f1))"

# 音声（前回スナップショットとハードリンク）
LINK_DEST=()
[ -d "$DEST/audio-latest" ] && LINK_DEST=(--link-dest="$DEST/audio-latest")
rsync -a --delete --exclude tmp/ "${LINK_DEST[@]}" data/audio/ "$DEST/audio-$TS/"
ln -sfn "audio-$TS" "$DEST/audio-latest"
echo "  audio: audio-$TS ($(du -sh "$DEST/audio-$TS" | cut -f1))"

# 古いものを消す
find "$DEST" -maxdepth 1 -name 'db-*.dump' -mtime +"$KEEP_DAYS" -print -delete
find "$DEST" -maxdepth 1 -type d -name 'audio-2*' -mtime +"$KEEP_DAYS" -print -exec rm -rf {} +
echo "[$(date -Is)] backup done"
