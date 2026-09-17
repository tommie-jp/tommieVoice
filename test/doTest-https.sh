#!/bin/bash
# HTTPS 設定の動作テスト
# Usage: ./test/doTest-https.sh <ドメイン名>
#
# doSetupHTTPS.sh 実行後に VPS もしくは任意のクライアントから実行し、
# HTTPS 配信 / HTTP→HTTPS リダイレクト / HSTS / SPA fallback を検証する。
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
    echo "Usage: $0 <ドメイン名>"
    exit 1
fi

GREEN=$'\e[32m'; RED=$'\e[31m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
pass() { echo "${GREEN}✅ $1${RESET}"; }
fail_msg() { echo "${RED}❌ $1${RESET}"; FAILED=$((FAILED + 1)); }
warn() { echo "${YELLOW}⚠️  $1${RESET}"; }

FAILED=0

echo "━━━ HTTPS テスト: $DOMAIN ━━━"

# 1. HTTPS で 200
echo ""
echo "1. HTTPS ルート"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/" --connect-timeout 5 --max-time 10 || echo "000")
if [ "$CODE" = "200" ]; then pass "https://$DOMAIN/ → 200"
else fail_msg "https://$DOMAIN/ → $CODE"; fi

# 2. HTTP→HTTPS リダイレクト
echo ""
echo "2. HTTP→HTTPS リダイレクト"
REDIR=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "http://$DOMAIN/" --connect-timeout 5 --max-time 10 || echo "000")
CODE="${REDIR%% *}"
LOC="${REDIR#* }"
if [ "$CODE" = "301" ] && [[ "$LOC" == https://* ]]; then
    pass "http://$DOMAIN/ → $CODE → $LOC"
else
    fail_msg "http://$DOMAIN/ → $CODE (redirect: $LOC)"
fi

# 3. HSTS ヘッダ
echo ""
echo "3. HSTS ヘッダ"
HSTS=$(curl -sI "https://$DOMAIN/" --connect-timeout 5 --max-time 10 | grep -i '^strict-transport-security:' || true)
if [ -n "$HSTS" ]; then pass "$(echo "$HSTS" | tr -d '\r')"
else fail_msg "Strict-Transport-Security ヘッダなし"; fi

# 4. SPA fallback（存在しないパスが index.html を返す）
echo ""
echo "4. SPA fallback（/__nonexistent-$$__ → index.html）"
BODY=$(curl -s "https://$DOMAIN/__nonexistent-$$__" --connect-timeout 5 --max-time 10 || true)
if echo "$BODY" | grep -qi '<!doctype html' && echo "$BODY" | grep -qi '<div id="root">'; then
    pass "存在しないパスが index.html を返す"
else
    warn "SPA fallback 未確認（index.html のマーカーが見つからず）"
fi

# 5. 証明書の有効期限
echo ""
echo "5. 証明書の有効期限"
if command -v openssl &>/dev/null; then
    END=$(echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)
    if [ -n "$END" ]; then pass "notAfter: $END"
    else fail_msg "証明書情報を取得できません"; fi
else
    warn "openssl が無いためスキップ"
fi

echo ""
if [ "$FAILED" -eq 0 ]; then
    echo "${GREEN}━━━ 全テスト PASS ━━━${RESET}"
    exit 0
else
    echo "${RED}━━━ $FAILED 件 FAIL ━━━${RESET}"
    exit 1
fi
