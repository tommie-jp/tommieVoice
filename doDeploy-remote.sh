#!/bin/bash
# リモートデプロイ（開発環境から VPS1 へ Docker Compose スタックをデプロイ）
# Usage: ./doDeploy-remote.sh [-y] [--no-build] [--static-only] [--rollback <TAG>] [-d <APP_DIR>] [VPSホスト] [SSHユーザー]
#
# 手順: npm run build → rsync（dist / server / shared / deploy / compose）→
#       VPS で pg_dump → api イメージ build → migrate → up -d → ヘルスチェック
SCRIPT_VERSION="2026-09-18a"

# ── .env.deploy 読み込み（任意、git 管理外） ──
# 形式:
#   DEPLOY_SSH_USER=deploy
#   DEPLOY_SSH_HOST=voice.tommie.jp
#   DEPLOY_APP_DIR=~/voice.tommie.jp-app
#   DEPLOY_PUBLIC_URL=https://voice.tommie.jp
ENV_DEPLOY="$(cd "$(dirname "$0")" && pwd)/.env.deploy"
if [ -f "$ENV_DEPLOY" ]; then
    # shellcheck source=/dev/null
    set -a; . "$ENV_DEPLOY"; set +a
fi

VPS_HOST="${DEPLOY_SSH_HOST:-}"
SSH_USER="${DEPLOY_SSH_USER:-deploy}"
APP_DIR="${DEPLOY_APP_DIR:-}"
PUBLIC_URL="${DEPLOY_PUBLIC_URL:-}"
FORCE_YES=false
SKIP_BUILD=false
STATIC_ONLY=false
ROLLBACK_TAG=""

usage() {
    cat <<'EOF'
Usage: ./doDeploy-remote.sh [options] [VPSホスト] [SSHユーザー]

開発環境（WSL2）から VPS1 へ tommieVoice（Docker Compose スタック）をデプロイする

処理内容:
  1. ローカルで npm run build（SPA）
  2. rsync で dist / server / shared / deploy / compose ファイルを APP_DIR へ転送
     （VPS の .env / data / backups は削除対象から保護する）
  3. VPS で DB バックアップ → api イメージ build → マイグレーション → up -d
  4. https://<ホスト>/api/healthz を確認

引数:
  VPSホスト                SSH 接続先（.env.deploy の DEPLOY_SSH_HOST で省略可）
  SSHユーザー              既定 deploy（.env.deploy の DEPLOY_SSH_USER）

オプション:
  -y, --yes                確認をスキップ
  --no-build               SPA のビルドをスキップ（既存の dist/ を転送）
  --static-only            SPA（dist/）だけを転送し、コンテナは触らない
  --rollback <TAG>         転送せず、指定タグの api イメージで起動し直す（DB は戻さない）
  -d, --dir <PATH>         VPS 上の配置先（既定 ~/<VPSホスト>-app）
  -h, --help               このヘルプ
  -v, --version            バージョン

前提:
  - VPS に SSH 鍵認証で接続でき、docker compose が使える
  - VPS の APP_DIR/.env を deploy/env.example から作成済み
  - ホスト nginx は doSetupHTTPS.sh で 127.0.0.1:8300 へ転送する設定済み
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help) usage; exit 0 ;;
        -v|--version) echo "doDeploy-remote.sh  version: ${SCRIPT_VERSION}"; exit 0 ;;
        -y|--yes) FORCE_YES=true; shift ;;
        --no-build) SKIP_BUILD=true; shift ;;
        --static-only) STATIC_ONLY=true; shift ;;
        --rollback)
            [ $# -ge 2 ] && [ -n "$2" ] || { echo "❌ --rollback にはタグが必要です" >&2; exit 1; }
            ROLLBACK_TAG="$2"; shift 2 ;;
        -d|--dir)
            [ $# -ge 2 ] && [ -n "$2" ] || { echo "❌ -d/--dir にはパスが必要です" >&2; exit 1; }
            APP_DIR="$2"; shift 2 ;;
        --dir=*) APP_DIR="${1#--dir=}"; shift ;;
        --) shift; break ;;
        -*) echo "❌ 不明なオプション: $1（-h でヘルプ）" >&2; exit 1 ;;
        *)
            if [ -z "$VPS_HOST" ]; then VPS_HOST="$1"; else SSH_USER="$1"; fi
            shift ;;
    esac
done

if [ -z "$VPS_HOST" ]; then
    usage; exit 1
fi
if ! [[ "$VPS_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || ! [[ "$SSH_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]; then
    echo "❌ VPS ホスト名またはユーザー名が不正です: '${SSH_USER}@${VPS_HOST}'" >&2; exit 1
fi
if [ -n "$ROLLBACK_TAG" ] && ! [[ "$ROLLBACK_TAG" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "❌ タグが不正です: '${ROLLBACK_TAG}'" >&2; exit 1
fi
APP_DIR="${APP_DIR:-~/${VPS_HOST}-app}"
# リモートのシェルに渡すので、使える文字を絞る
if ! [[ "$APP_DIR" =~ ^[A-Za-z0-9_./~-]+$ ]]; then
    echo "❌ APP_DIR に使えない文字が含まれています: '${APP_DIR}'" >&2; exit 1
fi
case "$APP_DIR" in
    ""|"/"|"/*"|".."|"../"*|"~"|"~/") echo "❌ APP_DIR が不正です: '${APP_DIR}'" >&2; exit 1 ;;
esac
PUBLIC_URL="${PUBLIC_URL:-https://${VPS_HOST}}"
SSH_TARGET="${SSH_USER}@${VPS_HOST}"
COMPOSE="docker compose -f compose.yml -f compose.prod.yml"

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_TAG="${ROLLBACK_TAG:-$(git -C "$ROOT_DIR" rev-parse --short HEAD)}"

GREEN=$'\e[32m'; RED=$'\e[31m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
step() { echo ""; echo "${GREEN}━━━ $1 ━━━${RESET}"; }
warn() { echo "${YELLOW}⚠️  $1${RESET}"; }
fail() { echo "${RED}❌ $1${RESET}"; exit 1; }
confirm() {
    [ "$FORCE_YES" = true ] && return 0
    read -r -p "  $1 (y/N): " ans
    case "$ans" in y|Y|yes|YES) return 0 ;; *) fail "中止しました" ;; esac
}
remote() { ssh "${SSH_TARGET}" "cd ${APP_DIR} && $*"; }

echo "doDeploy-remote.sh  version: ${SCRIPT_VERSION}"
echo "  target:   ${SSH_TARGET}"
echo "  app dir:  ${APP_DIR}"
echo "  image:    tommievoice-api:${IMAGE_TAG}"
echo "  mode:     $([ -n "$ROLLBACK_TAG" ] && echo rollback || ([ "$STATIC_ONLY" = true ] && echo static-only || echo full))"

step "0. 前提チェック"
ssh -o ConnectTimeout=5 -o BatchMode=yes "${SSH_TARGET}" "echo ok" >/dev/null 2>&1 \
    || fail "SSH 接続に失敗しました: ${SSH_TARGET}"
echo "  ✅ SSH"
ssh "${SSH_TARGET}" "docker compose version" >/dev/null 2>&1 \
    || fail "VPS で docker compose が使えません"
echo "  ✅ docker compose (VPS)"
ssh "${SSH_TARGET}" "mkdir -p ${APP_DIR}/data/audio/original ${APP_DIR}/data/audio/public ${APP_DIR}/data/audio/tmp ${APP_DIR}/backups"
if ! ssh "${SSH_TARGET}" "test -f ${APP_DIR}/.env"; then
    fail "${APP_DIR}/.env がありません。VPS で deploy/env.example をコピーして作成してください"
fi
echo "  ✅ .env (VPS)"
OWNER=$(ssh "${SSH_TARGET}" "stat -c %u ${APP_DIR}/data/audio")
if [ "$OWNER" != "1000" ]; then
    warn "data/audio の所有者 uid が ${OWNER} です。コンテナ（uid 1000）が書けるように:"
    warn "  ssh ${SSH_TARGET} 'sudo chown -R 1000:1000 ${APP_DIR}/data/audio'"
fi

if [ -n "$ROLLBACK_TAG" ]; then
    step "ロールバック: tommievoice-api:${ROLLBACK_TAG}"
    remote "docker image inspect tommievoice-api:${ROLLBACK_TAG} >/dev/null" \
        || fail "VPS にイメージ tommievoice-api:${ROLLBACK_TAG} がありません"
    confirm "api/worker を ${ROLLBACK_TAG} で起動し直します。よろしいですか？"
    remote "IMAGE_TAG=${ROLLBACK_TAG} ${COMPOSE} up -d --no-build api worker && ${COMPOSE} ps"
else
    if [ "$SKIP_BUILD" = true ]; then
        step "1. SPA ビルド: スキップ"
        [ -f "$ROOT_DIR/dist/index.html" ] || fail "dist/ がありません"
    else
        step "1. SPA ビルド"
        (cd "$ROOT_DIR" && npm ci --silent && npm run build >/dev/null) || fail "ビルドに失敗しました"
        echo "  ✅ dist/"
    fi

    step "2. 転送（rsync）"
    RSYNC_OPTS=(-az --delete
        --filter='P .env' --filter='P data/' --filter='P backups/'
        --exclude='node_modules' --exclude='server/test' --exclude='*.test.ts' --exclude='*.test.tsx')
    if [ "$STATIC_ONLY" = true ]; then
        SOURCES=(dist)
    else
        SOURCES=(dist server shared deploy package.json package-lock.json compose.yml compose.prod.yml .dockerignore)
    fi
    echo "  削除されるファイル（dry-run）:"
    (cd "$ROOT_DIR" && rsync "${RSYNC_OPTS[@]}" --dry-run --itemize-changes -R "${SOURCES[@]}" "${SSH_TARGET}:${APP_DIR}/") \
        | grep '^\*deleting' | head -20 || echo "  （なし）"
    confirm "転送します。よろしいですか？"
    (cd "$ROOT_DIR" && rsync "${RSYNC_OPTS[@]}" -R "${SOURCES[@]}" "${SSH_TARGET}:${APP_DIR}/")
    echo "  ✅ 転送完了"

    if [ "$STATIC_ONLY" = false ]; then
        step "3. DB バックアップ（マイグレーション前）"
        TS=$(date +%Y%m%d-%H%M%S)
        if remote "${COMPOSE} ps --status running --services | grep -qx db"; then
            remote "${COMPOSE} exec -T db sh -c 'pg_dump -Fc -U \"\$POSTGRES_USER\" \"\$POSTGRES_DB\"' > backups/pre-deploy-${TS}.dump"
            echo "  ✅ backups/pre-deploy-${TS}.dump"
        else
            warn "db が起動していないためスキップ（初回デプロイ）"
        fi

        step "4. api イメージ build → migrate → up"
        remote "IMAGE_TAG=${IMAGE_TAG} ${COMPOSE} build api"
        remote "IMAGE_TAG=${IMAGE_TAG} ${COMPOSE} up -d --wait db"
        remote "IMAGE_TAG=${IMAGE_TAG} ${COMPOSE} run --rm --no-deps api node --disable-warning=ExperimentalWarning server/src/db/migrate.ts"
        remote "IMAGE_TAG=${IMAGE_TAG} ${COMPOSE} up -d --wait --remove-orphans"
        remote "${COMPOSE} ps"
        echo "  ロールバック用: ./doDeploy-remote.sh --rollback <前回のタグ>"
    fi
fi

step "5. ヘルスチェック（${PUBLIC_URL}/api/healthz）"
for i in $(seq 1 10); do
    BODY=$(curl -fsS --max-time 5 "${PUBLIC_URL}/api/healthz" 2>/dev/null || true)
    if echo "$BODY" | grep -q '"ok":true'; then
        echo "  ✅ ${BODY} (${i})"
        ssh "${SSH_TARGET}" "free -m | head -2; docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | grep tommievoice || true"
        echo ""
        echo "${GREEN}デプロイ完了: ${PUBLIC_URL}/${RESET}"
        exit 0
    fi
    sleep 3
done
fail "ヘルスチェックに失敗しました。ssh ${SSH_TARGET} 'cd ${APP_DIR} && ${COMPOSE} logs --tail 100' で確認してください"
