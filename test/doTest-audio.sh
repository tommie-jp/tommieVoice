#!/bin/bash
# 音声配信とセキュリティヘッダの確認（デプロイ後に実行）
# Usage: ./test/doTest-audio.sh <ベースURL または ドメイン> [音声パス]
#   例: ./test/doTest-audio.sh voice.tommie.jp
#       ./test/doTest-audio.sh http://127.0.0.1:8300 /audio/public/2026/09/<uuid>.m4a
# 音声パスを省略すると、話題一覧→スレッド→投稿から公開済みの音声を 1 件探す。
set -euo pipefail

BASE="${1:-}"
[ -n "$BASE" ] || { echo "Usage: $0 <ベースURL|ドメイン> [音声パス]"; exit 1; }
case "$BASE" in http://*|https://*) ;; *) BASE="https://${BASE}" ;; esac
AUDIO="${2:-}"

GREEN=$'\e[32m'; RED=$'\e[31m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
FAILED=0
pass() { echo "${GREEN}✅ $1${RESET}"; }
ng() { echo "${RED}❌ $1${RESET}"; FAILED=$((FAILED + 1)); }
warn() { echo "${YELLOW}⚠️  $1${RESET}"; }

json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const v=JSON.parse(s);console.log($1)}catch{console.log('')}})"; }

echo "━━━ 1. API ━━━"
curl -fsS --max-time 5 "$BASE/api/healthz" | grep -q '"ok":true' && pass "/api/healthz" || ng "/api/healthz"

echo "━━━ 2. セキュリティヘッダ ━━━"
HEADERS=$(curl -sI --max-time 5 "$BASE/")
for h in content-security-policy x-content-type-options referrer-policy x-frame-options; do
    echo "$HEADERS" | grep -qi "^$h:" && pass "$h" || ng "$h がありません"
done

echo "━━━ 3. 原本は非公開 ━━━"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/audio/original/2026/01/00000000-0000-4000-8000-000000000000.webm")
[ "$CODE" = "404" ] && pass "/audio/original → 404" || ng "/audio/original → $CODE"

if [ -z "$AUDIO" ]; then
    SLUG=$(curl -fsS "$BASE/api/topics" | json "(v.data.find(t=>t.threadCount>0)||{}).slug||''")
    if [ -n "$SLUG" ]; then
        THREAD=$(curl -fsS "$BASE/api/topics/$SLUG/threads" | json "(v.data[0]||{}).id||''")
        [ -n "$THREAD" ] && AUDIO=$(curl -fsS "$BASE/api/threads/$THREAD" | json "(v.data.posts.find(p=>p.audioUrl)||{}).audioUrl||''")
    fi
fi

echo "━━━ 4. 音声の Range 配信 ━━━"
if [ -z "$AUDIO" ]; then
    warn "公開済みの音声が見つからないためスキップ"
else
    OUT=$(curl -s -o /dev/null -D - -r 0-99 --max-time 10 "$BASE$AUDIO")
    CODE=$(echo "$OUT" | head -1 | awk '{print $2}')
    [ "$CODE" = "206" ] && pass "Range → 206" || ng "Range → $CODE ($AUDIO)"
    echo "$OUT" | grep -qi '^content-type: audio/mp4' && pass "Content-Type: audio/mp4" || ng "Content-Type が audio/mp4 ではありません"
    echo "$OUT" | grep -qi '^cache-control:.*immutable' && pass "Cache-Control immutable" || ng "Cache-Control がありません"
fi

echo "━━━ 5. 共有 URL ━━━"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/s/p/00000000-0000-4000-8000-000000000000")
[ "$CODE" = "404" ] && pass "/s/p/<unknown> → 404 HTML" || ng "/s/p/<unknown> → $CODE"

echo ""
if [ "$FAILED" -eq 0 ]; then echo "${GREEN}━━━ 全テスト PASS ━━━${RESET}"; else echo "${RED}━━━ $FAILED 件 FAIL ━━━${RESET}"; exit 1; fi
