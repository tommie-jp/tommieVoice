#!/bin/bash
# Windows のブラウザでテストするための一括起動スクリプト（WSL2 で実行）
# Usage: ./doDevWindows.sh [--full] [--seed] [--open] [--no-worker] [--reset-db]
#
# 既定（開発モード）: DB コンテナ → マイグレーション → API / 変換ワーカー / Vite をこの端末で起動し、
#                     Windows から http://localhost:5173 で開けるか確認する。Ctrl+C で全部止める。
# --full          : 本番相当の 4 コンテナ（http://localhost:8300）を build して起動する
SCRIPT_VERSION="2026-09-18a"

MODE="dev"
SEED=false
OPEN=false
WORKER=true
RESET_DB=false
RELAX_LIMITS=true

usage() {
    cat <<'EOF'
Usage: ./doDevWindows.sh [options]

Windows のブラウザで tommieVoice を試すための環境を 1 コマンドで起動する

モード:
  （既定）         開発モード。DB はコンテナ、API・ワーカー・Vite はこの端末で動かす
                   URL: http://localhost:5173（HMR あり）。Ctrl+C で API・ワーカー・Vite を止める
  --full           本番相当の db / api / worker / web コンテナを build して起動する
                   URL: http://localhost:8300。止めるときは ./doDevWindows.sh --down

オプション:
  --seed           お試し用の話題・配信者・凸待ち箱を作る（配信者のログインキーを表示）
  --open           Windows の既定ブラウザで開く
  --no-worker      変換ワーカーを起動しない（開発モードのみ。投稿は「変換中」のままになる）
  --reset-db       開発用 DB を空にしてからマイグレーションする（確認あり）
  --real-limits    本番と同じ投稿レート制限にする（既定はローカル検証用に緩める）
  --down           --full で起動したコンテナを止める
  -h, --help       このヘルプ
  -v, --version    バージョン

前提:
  - Docker / ffmpeg / nvm の Node 24 が入っている
  - 開発モードは .env が必要。無ければ開発用の値（鍵はランダム生成）で作成する
  - 開発モードの管理トークンは .env の ADMIN_TOKEN、--full は compose.override.yml の開発用固定値
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help) usage; exit 0 ;;
        -v|--version) echo "doDevWindows.sh  version: ${SCRIPT_VERSION}"; exit 0 ;;
        --full) MODE="full"; shift ;;
        --down) MODE="down"; shift ;;
        --seed) SEED=true; shift ;;
        --open) OPEN=true; shift ;;
        --no-worker) WORKER=false; shift ;;
        --reset-db) RESET_DB=true; shift ;;
        --real-limits) RELAX_LIMITS=false; shift ;;
        *) echo "❌ 不明なオプション: $1（-h でヘルプ）" >&2; exit 1 ;;
    esac
done

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

GREEN=$'\e[32m'; RED=$'\e[31m'; YELLOW=$'\e[33m'; BOLD=$'\e[1m'; RESET=$'\e[0m'
step() { echo ""; echo "${GREEN}━━━ $1 ━━━${RESET}"; }
warn() { echo "${YELLOW}⚠️  $1${RESET}"; }
fail() { echo "${RED}❌ $1${RESET}" >&2; exit 1; }

API_PORT=3100
WEB_PORT=5173
FULL_PORT=8300
FULL_ADMIN_TOKEN="dev-only-admin-token-000000000000000000"
LOG_DIR="$ROOT_DIR/logs"
PIDS=()

# ── Node（nvm）を有効化 ──
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh" >/dev/null
fi

json_field() {
    # 標準入力の JSON から JS 式で値を取り出す（例: json_field 'v.data.id'）
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const v=JSON.parse(s);const r=($1);console.log(r??'')}catch{console.log('')}})"
}

port_in_use() {
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
}

wait_http() {
    local url="$1" label="$2" tries="${3:-40}"
    for _ in $(seq 1 "$tries"); do
        if curl -fs -o /dev/null --max-time 2 "$url"; then
            echo "  ✅ $label"
            return 0
        fi
        sleep 0.5
    done
    return 1
}

check_from_windows() {
    local url="$1"
    if ! command -v powershell.exe >/dev/null 2>&1; then
        warn "powershell.exe が無いため Windows 側からの確認をスキップ"
        return 0
    fi
    local code
    code=$(powershell.exe -NoProfile -Command \
        "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 '$url').StatusCode } catch { 'ERR' }" 2>/dev/null | tr -d '\r' | tail -1)
    if [ "$code" = "200" ]; then
        echo "  ✅ Windows から $url → 200"
    else
        warn "Windows から $url に届きません（$code）。WSL の再起動（wsl --shutdown）やファイアウォールを確認してください"
    fi
}

open_in_windows() {
    local url="$1"
    if command -v cmd.exe >/dev/null 2>&1; then
        (cd /mnt/c 2>/dev/null && cmd.exe /c start "" "$url" >/dev/null 2>&1) || warn "ブラウザを開けませんでした: $url"
    fi
}

ensure_env() {
    if [ -f .env ]; then
        echo "  ✅ .env あり"
        return 0
    fi
    warn ".env が無いので開発用の .env を作成します（鍵はランダム）"
    local k1 k2 k3 k4
    k1=$(openssl rand -hex 24); k2=$(openssl rand -hex 24); k3=$(openssl rand -hex 24); k4=$(openssl rand -hex 24)
    umask 077
    cat > .env <<EOF
NODE_ENV=development
DATABASE_URL=postgres://tommievoice:tommievoice-dev@127.0.0.1:5436/tommievoice
AUDIO_DIR=./data/audio
PUBLIC_ORIGIN=http://localhost:${WEB_PORT}
SERVE_AUDIO_FROM_API=true
LOG_LEVEL=info
ADMIN_TOKEN=${k1}
HASH_KEY=${k2}
SESSION_KEY=${k3}
WORKER_TOKEN=${k4}
EOF
    echo "  ✅ .env を作成しました（管理トークンは .env の ADMIN_TOKEN）"
}

admin_token() {
    if [ "$MODE" = "full" ]; then
        echo "$FULL_ADMIN_TOKEN"
    else
        # .env の ADMIN_TOKEN だけを読む（画面には出さない）
        grep -E '^ADMIN_TOKEN=' .env | head -1 | cut -d= -f2-
    fi
}

seed() {
    local base="$1" token
    token="$(admin_token)"
    [ -n "$token" ] || { warn "ADMIN_TOKEN が読めないため --seed をスキップ"; return 0; }
    step "お試しデータ"
    local count
    count=$(curl -fsS "$base/api/topics" | json_field 'v.data.length')
    if [ "${count:-0}" != "0" ]; then
        echo "  話題がすでに ${count} 件あるため作成しません"
        return 0
    fi
    local auth=(-H "authorization: Bearer $token" -H 'content-type: application/json')
    curl -fsS -X POST "$base/api/admin/topics" "${auth[@]}" \
        -d '{"slug":"seiyu-asobi","title":"ネット声優あそび","description":"お題の台詞に声を当てて投稿しよう","scriptText":"「ここは任せて先に行け！」\n「必ず戻ってこいよ」"}' >/dev/null
    curl -fsS -X POST "$base/api/admin/topics" "${auth[@]}" \
        -d '{"slug":"zatsudan","title":"雑談・近況","description":"今日あったことを声で","sortOrder":1}' >/dev/null
    local issued streamer_id login_key
    issued=$(curl -fsS -X POST "$base/api/admin/streamers" "${auth[@]}" -d '{"displayName":"テスト配信者"}')
    streamer_id=$(echo "$issued" | json_field 'v.data.streamer.id')
    login_key=$(echo "$issued" | json_field 'v.data.loginKey')
    curl -fsS -X POST "$base/api/admin/topics" "${auth[@]}" \
        -d "{\"slug\":\"totsu-box\",\"title\":\"テスト配信者の凸待ち箱\",\"mode\":\"inbox\",\"ownerId\":\"${streamer_id}\",\"sortOrder\":-1}" >/dev/null
    echo "  ✅ 話題 3 件（公開掲示板 2・凸待ち箱 1）と配信者 1 人を作成"
    echo ""
    echo "  ${BOLD}配信者ログインキー（この場でしか表示されません）:${RESET}"
    echo "  ${login_key}"
}

show_urls() {
    local base="$1"
    echo ""
    echo "${GREEN}=========================================${RESET}"
    echo "${GREEN}  Windows のブラウザで開く URL${RESET}"
    echo "${GREEN}=========================================${RESET}"
    echo "  トップ          ${base}/"
    echo "  管理画面        ${base}/admin"
    echo "  配信者ログイン  ${base}/streamer/login"
    echo "  自分の投稿      ${base}/mine"
    echo "  文字起こし計測  ${base}/lab/transcribe   （Chrome / Edge で。WebGPU が必要）"
    echo "  実機ログ表示    ${base}/?debug=1"
    if [ "$MODE" = "full" ]; then
        echo "  管理トークン    ${FULL_ADMIN_TOKEN}"
    else
        echo "  管理トークン    .env の ADMIN_TOKEN"
    fi
}

cleanup() {
    trap - INT TERM EXIT
    if [ ${#PIDS[@]} -gt 0 ]; then
        echo ""
        echo "停止します…"
        for pid in "${PIDS[@]}"; do
            kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
        done
        wait 2>/dev/null || true
        echo "  API・ワーカー・Vite を止めました（DB コンテナは起動したまま。止める: docker compose stop db）"
    fi
}

start_bg() {
    local name="$1"; shift
    local log="$LOG_DIR/dev-$name.log"
    : > "$log"
    setsid "$@" >"$log" 2>&1 &
    PIDS+=("$!")
    echo "  ▶ $name（ログ: logs/dev-$name.log）"
}

echo "doDevWindows.sh  version: ${SCRIPT_VERSION}  mode: ${MODE}"

if [ "$MODE" = "down" ]; then
    docker compose --profile full stop api worker web
    echo "✅ api / worker / web を止めました（DB は起動したまま）"
    exit 0
fi

step "0. 前提チェック"
command -v docker >/dev/null || fail "docker がありません"
command -v node >/dev/null || fail "Node がありません（nvm で 24 系を入れてください）"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' \
    || fail "Node 24 以上が必要です（現在 $(node -v)）"
echo "  ✅ node $(node -v) / $(docker --version | cut -d, -f1)"
[ -d node_modules ] || { echo "  npm ci…"; npm ci --silent; }

if [ "$MODE" = "full" ]; then
    port_in_use "$FULL_PORT" && ! docker compose ps --status running --services 2>/dev/null | grep -qx web \
        && fail "ポート ${FULL_PORT} が他で使われています"

    step "1. SPA ビルド"
    npm run build >/dev/null || fail "ビルドに失敗しました（npm run build で確認）"
    echo "  ✅ dist/"
    mkdir -p data/audio/original data/audio/public data/audio/tmp

    step "2. コンテナ build と起動"
    docker compose --profile full build api
    docker compose --profile full up -d --wait db
    docker compose --profile full run --rm --no-deps \
        -e DATABASE_URL=postgres://tommievoice:tommievoice-dev@db:5432/tommievoice \
        api node --disable-warning=ExperimentalWarning server/src/db/migrate.ts
    docker compose --profile full up -d --wait
    BASE="http://localhost:${FULL_PORT}"
    wait_http "$BASE/api/healthz" "API（コンテナ）" || fail "API が起動しません: docker compose --profile full logs api"

    step "3. Windows からの疎通"
    check_from_windows "$BASE/healthz"
    [ "$SEED" = true ] && seed "$BASE"
    show_urls "$BASE"
    echo ""
    echo "  止める: ./doDevWindows.sh --down"
    [ "$OPEN" = true ] && open_in_windows "$BASE/"
    exit 0
fi

# ── 開発モード ──
for p in "$API_PORT" "$WEB_PORT"; do
    port_in_use "$p" && fail "ポート ${p} が使用中です。前に起動した npm run dev / dev:api を止めてください（ss -ltnp | grep ${p}）"
done
if [ "$WORKER" = true ] && ! command -v ffmpeg >/dev/null; then
    fail "ffmpeg がありません（sudo apt install ffmpeg、または --no-worker）"
fi
ensure_env
mkdir -p "$LOG_DIR" data/audio

step "1. DB"
npm run --silent db:up >/dev/null
echo "  ✅ PostgreSQL（127.0.0.1:5436）"
if [ "$RESET_DB" = true ]; then
    read -r -p "  開発用 DB（tommievoice）の中身をすべて消します。よろしいですか？ (y/N): " ans
    case "$ans" in
        y|Y) docker compose exec -T db psql -U tommievoice -d tommievoice -q \
                -c 'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS pgboss CASCADE; CREATE SCHEMA public;'
             echo "  ✅ 空にしました" ;;
        *) echo "  スキップしました" ;;
    esac
fi
npm run --silent db:migrate
echo "  ✅ マイグレーション"

step "2. API・ワーカー・Vite を起動"
trap cleanup INT TERM EXIT
if [ "$RELAX_LIMITS" = true ]; then
    # 同じ端末から何度も投稿して試せるように制限を緩める（本番では起動時に拒否される）
    export RELAX_RATE_LIMITS=true
    echo "  ℹ️  投稿のレート制限を緩めています（本番同等にするには --real-limits）"
fi
start_bg api npm run --silent dev:api
[ "$WORKER" = true ] && start_bg worker npm run --silent dev:worker
start_bg vite npm run --silent dev -- --port "$WEB_PORT" --strictPort

wait_http "http://127.0.0.1:${API_PORT}/api/healthz" "API（:${API_PORT}）" \
    || { tail -20 "$LOG_DIR/dev-api.log"; fail "API が起動しません"; }
wait_http "http://127.0.0.1:${WEB_PORT}/" "Vite（:${WEB_PORT}）" \
    || { tail -20 "$LOG_DIR/dev-vite.log"; fail "Vite が起動しません"; }

step "3. Windows からの疎通"
BASE="http://localhost:${WEB_PORT}"
check_from_windows "$BASE/api/healthz"
[ "$SEED" = true ] && seed "$BASE"
show_urls "$BASE"
[ "$OPEN" = true ] && open_in_windows "$BASE/"

echo ""
echo "  ${BOLD}Ctrl+C で停止${RESET}。ログ: tail -f logs/dev-*.log"
# どれかが落ちたら知らせて全部止める
wait -n "${PIDS[@]}" || true
warn "いずれかのプロセスが終了しました。logs/dev-*.log を確認してください"
