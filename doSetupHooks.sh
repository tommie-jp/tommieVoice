#!/bin/bash
# git の hooksPath をリポジトリ内の hooks/ に切り替える（1 回だけ実行）。
# 以降、hooks/pre-commit 等が自動で走る。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d .git ]; then
    echo "❌ ここは git リポジトリのルートではありません" >&2
    exit 1
fi
if [ ! -d hooks ]; then
    echo "❌ hooks/ ディレクトリがありません" >&2
    exit 1
fi

chmod +x hooks/*

git config core.hooksPath hooks
echo "✅ core.hooksPath = $(git config core.hooksPath)"
echo "  有効な hook:"
ls -la hooks/ | grep -v '^d\|^total' | awk '{print "    "$NF}'
