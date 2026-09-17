#!/bin/bash
# HTTPS 設定スクリプト（Let's Encrypt + ホスト nginx → tommieVoice の web コンテナ）
# Usage: ./doSetupHTTPS.sh <ドメイン名> [-u <UPSTREAM>] [-e <EMAIL>]
#
# 前提:
#   - VPS1 上で（非 root, sudo 権限ありのユーザーで）、デプロイ先 APP_DIR の中から実行する
#   - DNS の A レコードがこのサーバーの IP を指している
#
# 構成:
#   ブラウザ → ホスト nginx (443/HTTPS) → 127.0.0.1:8300（web コンテナ）→ api / 静的ファイル
#   iOS Safari の getUserMedia は HTTPS 必須のため本スクリプトで終端する。
#   ホスト nginx は X-Forwarded-For を実クライアント IP で上書きする（なりすまし防止）。
SCRIPT_VERSION="2026-09-18a"

DOMAIN=""
UPSTREAM="127.0.0.1:8300"
EMAIL=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/deploy/nginx/host-site.conf.tmpl"

usage() {
    cat <<'EOF'
Usage: ./doSetupHTTPS.sh <ドメイン名> [-u <UPSTREAM>] [-e <EMAIL>]

Let's Encrypt でホスト nginx に HTTPS を設定し、web コンテナへリバースプロキシする

引数:
  <ドメイン名>             例: voice.tommie.jp

オプション:
  -u, --upstream <H:P>     転送先（既定 127.0.0.1:8300 = compose.prod.yml の web）
  -e, --email <EMAIL>      Let's Encrypt 登録メール（省略時は --register-unsafely-without-email）
  -h, --help               このヘルプを表示
  -v, --version            バージョンを表示
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help)    usage; exit 0 ;;
        -v|--version) echo "doSetupHTTPS.sh  version: ${SCRIPT_VERSION}"; exit 0 ;;
        -u|--upstream)
            [ $# -ge 2 ] && [ -n "$2" ] || { echo "❌ -u には host:port が必要です" >&2; exit 1; }
            UPSTREAM="$2"; shift 2 ;;
        -e|--email)
            [ $# -ge 2 ] && [ -n "$2" ] || { echo "❌ -e にはメールアドレスが必要です" >&2; exit 1; }
            EMAIL="$2"; shift 2 ;;
        --) shift; break ;;
        -*) echo "❌ 不明なオプション: $1" >&2; usage >&2; exit 1 ;;
        *)
            if [ -z "$DOMAIN" ]; then DOMAIN="$1"
            else echo "❌ 余分な引数: $1" >&2; exit 1
            fi
            shift ;;
    esac
done

[ -n "$DOMAIN" ] || { usage; exit 1; }
case "$DOMAIN" in
    *[!a-zA-Z0-9.-]*|-*|*-|.*|*.|*..*) echo "❌ ドメイン名が不正です: '${DOMAIN}'" >&2; exit 1 ;;
esac
if ! [[ "$UPSTREAM" =~ ^127\.0\.0\.1:[0-9]{2,5}$ ]]; then
    echo "❌ UPSTREAM は 127.0.0.1:<port> の形式にしてください: '${UPSTREAM}'" >&2; exit 1
fi
if [ -n "$EMAIL" ] && ! [[ "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]]; then
    echo "❌ メールアドレスが不正です: '${EMAIL}'" >&2; exit 1
fi

set -euo pipefail

GREEN=$'\e[32m'; RED=$'\e[31m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
step() { echo ""; echo "${GREEN}━━━ $1 ━━━${RESET}"; }
warn() { echo "${YELLOW}⚠️  $1${RESET}"; }
fail() { echo "${RED}❌ $1${RESET}"; exit 1; }

echo "doSetupHTTPS.sh  version: ${SCRIPT_VERSION}"
echo "  domain:   ${DOMAIN}"
echo "  upstream: ${UPSTREAM}"
echo "  email:    ${EMAIL:-（未指定）}"

step "0. 前提チェック"
[ "$(id -u)" -ne 0 ] || fail "root で実行しないでください"
[ -f "$TEMPLATE" ] || fail "テンプレートがありません: ${TEMPLATE}（APP_DIR から実行してください）"
if ! sudo -n true 2>/dev/null; then
    echo "  ℹ️  sudo のパスワード入力が必要です"
    sudo -v || fail "sudo を使えません"
fi
if curl -fsS --max-time 3 "http://${UPSTREAM}/healthz" >/dev/null 2>&1; then
    echo "  ✅ web コンテナ応答あり"
else
    warn "http://${UPSTREAM}/healthz が応答しません（先に doDeploy-remote.sh でスタックを起動してください）"
fi

step "1. nginx / certbot"
command -v nginx &>/dev/null || { sudo apt-get update && sudo apt-get install -y nginx; }
command -v certbot &>/dev/null || { sudo apt-get update && sudo apt-get install -y certbot; }
echo "  ✅ $(nginx -v 2>&1)"

step "2. 証明書（${DOMAIN}）"
if [ -n "$EMAIL" ]; then CERT_EMAIL=(--email "$EMAIL"); else CERT_EMAIL=(--register-unsafely-without-email); fi
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo "  既存の証明書を使います"
else
    sudo systemctl stop nginx 2>/dev/null || true
    sudo certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos "${CERT_EMAIL[@]}"
    sudo systemctl start nginx 2>/dev/null || true
    echo "  ✅ 取得完了"
fi

step "3. ホスト nginx 設定（/etc/nginx/sites-available/$DOMAIN）"
SITE="/etc/nginx/sites-available/$DOMAIN"
if [ -f "$SITE" ]; then
    sudo cp "$SITE" "$SITE.bak-$(date +%Y%m%d-%H%M%S)"
    echo "  既存設定をバックアップしました"
fi
sed -e "s/__DOMAIN__/${DOMAIN}/g" -e "s/__UPSTREAM__/${UPSTREAM}/g" "$TEMPLATE" | sudo tee "$SITE" >/dev/null
sudo ln -sf "$SITE" /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
if sudo nginx -t; then
    sudo systemctl enable nginx >/dev/null 2>&1 || true
    sudo systemctl reload nginx || sudo systemctl restart nginx
    echo "  ✅ 反映しました"
else
    fail "nginx 設定テストに失敗しました（${SITE}.bak-* から戻せます）"
fi

step "4. 証明書の自動更新"
CRON_CMD="0 3 1,15 * * certbot renew --pre-hook 'systemctl stop nginx' --post-hook 'systemctl start nginx'"
if sudo crontab -l 2>/dev/null | grep -q 'certbot renew'; then
    echo "  設定済み"
else
    (sudo crontab -l 2>/dev/null; echo "$CRON_CMD") | sudo crontab -
    echo "  ✅ 毎月 1・15 日 3:00"
fi

step "5. 動作確認"
sleep 2
for path in / /api/healthz; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}${path}" --max-time 10 || echo 000)
    if [ "$CODE" = "200" ]; then echo "  ✅ https://${DOMAIN}${path} → ${CODE}"
    else warn "https://${DOMAIN}${path} → ${CODE}"; fi
done
echo ""
echo "確認: ./test/doTest-https.sh ${DOMAIN} && ./test/doTest-audio.sh ${DOMAIN}"
