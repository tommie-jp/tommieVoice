#!/bin/bash
# 本番相当の 4 コンテナ（db / api / worker / web）をこの PC で起動して疎通を確認する。
# Usage: ./test/doTest-compose.sh [--keep]
#   --keep  終了後もコンテナを残す（既定は down する）
set -euo pipefail
cd "$(dirname "$0")/.."

KEEP=false
[ "${1:-}" = "--keep" ] && KEEP=true
BASE="http://127.0.0.1:8300"

GREEN=$'\e[32m'; RED=$'\e[31m'; RESET=$'\e[0m'
FAILED=0
pass() { echo "${GREEN}✅ $1${RESET}"; }
ng() { echo "${RED}❌ $1${RESET}"; FAILED=$((FAILED + 1)); }

expect_code() {
    local want="$1" url="$2" got
    got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || echo 000)
    if [ "$got" = "$want" ]; then pass "$url → $got"; else ng "$url → $got (期待 $want)"; fi
}

cleanup() {
    if [ "$KEEP" = false ]; then
        docker compose --profile full down >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

echo "━━━ compose 設定の検証 ━━━"
docker compose --profile full config -q && pass "compose config"

[ -f dist/index.html ] || { echo "dist/ がありません。先に npm run build を実行してください"; exit 1; }
mkdir -p data/audio/original data/audio/public

echo "━━━ 起動（build + migrate + up） ━━━"
docker compose --profile full build api
docker compose --profile full run --rm --no-deps -e DATABASE_URL=postgres://tommievoice:tommievoice-dev@db:5432/tommievoice api \
    node --disable-warning=ExperimentalWarning server/src/db/migrate.ts
docker compose --profile full up -d --wait

echo "━━━ 疎通 ━━━"
expect_code 200 "$BASE/healthz"
expect_code 200 "$BASE/api/healthz"
expect_code 200 "$BASE/"
expect_code 200 "$BASE/t/some-topic"
expect_code 404 "$BASE/audio/original/x.webm"
expect_code 404 "$BASE/api/does-not-exist"

echo "━━━ 投稿 → ワーカーで m4a に変換 ━━━"
TOKEN=dev-only-admin-token-000000000000000000
SLUG="compose-$(date +%s)"
curl -fsS -X POST "$BASE/api/admin/topics" -H "authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' -d "{\"slug\":\"$SLUG\",\"title\":\"compose test\"}" >/dev/null \
    && pass "話題を作成" || ng "話題の作成に失敗"
POSTED=$(curl -fsS -X POST "$BASE/api/topics/$SLUG/threads" \
    -H "x-device-id: $(cat /proc/sys/kernel/random/uuid)" \
    -F title=compose -F durationMs=1000 -F "audio=@server/test/fixtures/sample.webm;type=audio/webm")
THREAD=$(echo "$POSTED" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.thread.id))")
AUDIO=""
for _ in $(seq 1 20); do
    AUDIO=$(curl -fsS "$BASE/api/threads/$THREAD" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.posts[0].audioUrl||''))")
    [ -n "$AUDIO" ] && break
    sleep 1
done
if [[ "$AUDIO" == *.m4a ]]; then pass "変換済み: $AUDIO"; else ng "変換されませんでした"; fi
./test/doTest-audio.sh "$BASE" "$AUDIO" || FAILED=$((FAILED + 1))

echo "━━━ SSE がバッファされずに届く（web nginx 経由） ━━━"
KEY=$(curl -fsS -X POST "$BASE/api/admin/streamers" -H "authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' -d '{"displayName":"compose"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.loginKey))")
JAR=$(mktemp)
curl -fsS -c "$JAR" -X POST "$BASE/api/streamer/session" -H 'x-requested-with: tommieVoice' \
    -H 'content-type: application/json' -d "{\"loginKey\":\"$KEY\"}" >/dev/null
OVERLAY=$(curl -fsS -b "$JAR" -X POST "$BASE/api/streamer/overlay-token" -H 'x-requested-with: tommieVoice' \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.token))")
SSE_OUT=$(mktemp)
curl -sN --max-time 4 "$BASE/api/overlay/$OVERLAY/events" > "$SSE_OUT" &
sleep 1
curl -fsS -b "$JAR" -X POST "$BASE/api/streamer/overlay/control" -H 'x-requested-with: tommieVoice' \
    -H 'content-type: application/json' -d '{"action":"stop"}' >/dev/null
wait || true
if grep -q 'event: hello' "$SSE_OUT" && grep -q 'event: stop' "$SSE_OUT"; then pass "SSE hello / stop を受信"; else ng "SSE を受信できません: $(head -c 200 "$SSE_OUT")"; fi
rm -f "$JAR" "$SSE_OUT"

echo "━━━ api 再作成後も web から到達できる ━━━"
docker compose --profile full up -d --force-recreate --wait api
expect_code 200 "$BASE/api/healthz"

docker compose --profile full ps

if [ "$FAILED" -eq 0 ]; then echo "${GREEN}━━━ 全テスト PASS ━━━${RESET}"; else echo "${RED}━━━ $FAILED 件 FAIL ━━━${RESET}"; exit 1; fi
