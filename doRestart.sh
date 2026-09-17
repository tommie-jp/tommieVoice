#!/bin/bash
# nginx 再起動スクリプト（tommieVoice / VPS 上で実行）
# Usage: ./doRestart.sh [--restart] [--status] [--stack] [--time] [-d <DOMAIN>]
#
# ホスト nginx を検証してから reload / restart し、HTTPS の疎通を確認する。
# --stack を付けると、このスクリプトのあるディレクトリの Docker Compose スタックも再起動する。
# 既定は reload（無停止）。明示的に stop → start したい場合は --restart。
SCRIPT_VERSION="2026-09-18a"

usage() {
    cat <<'EOF'
Usage: ./doRestart.sh [--restart] [--status] [--stack] [--time] [-d <DOMAIN>]

ホスト nginx を reload/restart し、HTTPS 疎通を確認する

動作:
  既定                      nginx -t → systemctl reload nginx → curl 確認
  --restart                 systemctl restart nginx（完全再起動）
  --status                  再起動せず現在の状態のみ表示
  --stack                   Docker Compose スタック（db/api/worker/web）も再起動し、ps と直近ログを表示

オプション:
  -d, --domain <DOMAIN>     確認対象ドメイン
                            省略時は 親ディレクトリ名から "-admin" を除いたもの
                            （例: voice.tommie.jp-admin/ → voice.tommie.jp）
  --time                    処理全体を time で計測
  -h, --help                このヘルプ
  -v, --version             バージョン

前提:
  - VPS 上で（非 root, sudo 権限ありのユーザー）実行する
  - doSetupHTTPS.sh により nginx/証明書が設定済み
EOF
}

ACTION="reload"
TIME_MEASURE=false
STACK=false
DOMAIN=""
COMPOSE="docker compose -f compose.yml -f compose.prod.yml"

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help)    usage; exit 0 ;;
        -v|--version) echo "doRestart.sh  version: ${SCRIPT_VERSION}"; exit 0 ;;
        --restart) ACTION="restart"; shift ;;
        --status)  ACTION="status";  shift ;;
        --time)    TIME_MEASURE=true; shift ;;
        --stack)   STACK=true; shift ;;
        -d|--domain)
            if [ $# -lt 2 ] || [ -z "$2" ]; then
                echo "❌ -d/--domain には値が必要です" >&2; exit 1
            fi
            DOMAIN="$2"; shift 2 ;;
        --domain=*) DOMAIN="${1#--domain=}"; shift ;;
        *) echo "❌ 不明なオプション: $1" >&2; usage >&2; exit 2 ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ドメイン自動検出: 親ディレクトリ名から "-admin" を剥がす
if [ -z "$DOMAIN" ]; then
    base="$(basename "$SCRIPT_DIR")"
    DOMAIN="${base%-admin}"
    DOMAIN="${DOMAIN%-app}"
fi
case "$DOMAIN" in
    *[!a-zA-Z0-9.-]*|""|-*|*-|.*|*.|*..*)
        echo "❌ ドメイン名が不正です: '${DOMAIN}'（-d で指定してください）" >&2; exit 1 ;;
esac

GREEN=$'\e[32m'; RED=$'\e[31m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
step() { echo ""; echo "${GREEN}━━━ $1 ━━━${RESET}"; }
warn() { echo "${YELLOW}⚠️  $1${RESET}"; }
fail() { echo "${RED}❌ $1${RESET}"; exit 1; }

echo "doRestart.sh  version: ${SCRIPT_VERSION}"
echo "  action: ${ACTION}"
echo "  domain: ${DOMAIN}"

run_main() {
    set -euo pipefail

    # ── 前提チェック ──
    if [ "$(id -u)" -eq 0 ]; then
        fail "root で実行しないでください（sudo 権限を持つ一般ユーザーで実行）"
    fi
    if ! command -v nginx &>/dev/null; then
        fail "nginx がインストールされていません（先に doSetupHTTPS.sh を実行）"
    fi
    if ! sudo -n true 2>/dev/null; then
        echo "  ℹ️  sudo のパスワード入力が必要です"
        sudo -v || fail "sudo を使えません"
    fi

    case "$ACTION" in
        status)
            step "nginx ステータス"
            sudo systemctl status nginx --no-pager || true
            ;;
        reload|restart)
            step "1. nginx 設定テスト"
            if ! sudo nginx -t; then
                fail "nginx 設定テストに失敗しました（reload/restart を中止）"
            fi

            step "2. nginx ${ACTION}"
            if [ "$ACTION" = "reload" ] && ! sudo systemctl is-active --quiet nginx; then
                warn "nginx が停止中のため reload は使えません。start に切り替えます"
                sudo systemctl start nginx
            else
                sudo systemctl "$ACTION" nginx
            fi

            if ! sudo systemctl is-active --quiet nginx; then
                sudo systemctl status nginx --no-pager || true
                fail "nginx が起動していません"
            fi
            echo "  ✅ nginx 稼働中"
            ;;
    esac

    if [ "$STACK" = true ]; then
        step "Docker Compose スタック"
        cd "$SCRIPT_DIR"
        [ -f compose.yml ] || fail "compose.yml がありません（APP_DIR で実行してください）"
        if [ "$ACTION" != "status" ]; then
            $COMPOSE restart
        fi
        $COMPOSE ps
        $COMPOSE logs --tail 20 api worker || true
    fi

    # ── HTTPS 応答確認（最大 10 秒リトライ） ──
    step "3. HTTPS 応答確認（https://${DOMAIN}/）"
    CODE="000"
    for i in $(seq 1 10); do
        CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/" \
            --connect-timeout 3 --max-time 5 2>/dev/null || echo "000")
        if [ "$CODE" = "200" ]; then
            echo "  ✅ HTTP ${CODE} (${i}s)"
            return 0
        fi
        sleep 1
    done

    warn "HTTP ${CODE}（確認してください）"
    echo "--- journalctl -u nginx (末尾 30 行) ---"
    sudo journalctl -u nginx --no-pager -n 30 || true
    return 1
}

set +e
if [ "$TIME_MEASURE" = true ]; then
    time run_main
    rc=$?
else
    run_main
    rc=$?
fi
exit $rc
