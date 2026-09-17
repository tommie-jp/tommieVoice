# CLAUDE.md（公開リポジトリ）

> このリポジトリは非公開リポジトリ `27-tommieVoice/` の中にある公開リポジトリです。
> 設計メモ・運用手順は外側の `../docs/` にあります。

- tommieVoiceはWebアプリの音声掲示板です。
- 音声を投稿し、聴くことができます。
- スマホファースト。PC版よりスマホ版を優先します。
- 優先順位：iOS, Android, Windows11, Mac OS
- 実装する前に計画を示して。
- テストスクリプトを作ります。

## Stack

- **Node**: 24.x LTS via nvm（`~/.nvm`）。`/usr/bin/node` (v18) は無視。新規シェルでは自動で nvm の Node が入る（[~/.bashrc-wsl40](~/.bashrc-wsl40)）。
- **Vite 8** + **React 19** + **TypeScript 6**（`react-ts` テンプレ、`@vitejs/plugin-react` Babel ベース）
- **ESLint 9** (flat config, `typescript-eslint`, `react-hooks`, `react-refresh`) + **Prettier 3**（`eslint-config-prettier` で衝突回避）
- **Vitest 4** + **@testing-library/react** + **jsdom**（globals 有効、setup ファイル: [src/test/setup.ts](src/test/setup.ts)）。projects は `web`（jsdom）と `server`（node + PostgreSQL）
- **サーバ**: Fastify 5 + zod 4 + Drizzle ORM + PostgreSQL 17 + pg-boss 12 + ffmpeg。Node 24 の型ストリップで `.ts` を直接実行（ビルドしない）
- **E2E**: Playwright（iPhone 15 プロファイル）
- **インフラ**: Docker Compose（db / api / worker / web）。デプロイ先は VPS1（ホスト nginx が TLS 終端 → 127.0.0.1:8300）

## Commands

```bash
npm run dev          # Vite dev server (HMR)
npm run build        # tsc -b で型チェック → vite build → dist/
npm run preview      # 本番ビルドをローカルで確認
npm run lint         # ESLint
npm run format       # Prettier 全ファイル整形
npm run format:check # Prettier 差分チェック (CI 用)
npm run test         # Vitest watch
npm run test:run     # Vitest 1回実行 (CI 用)
npm run test:ui      # Vitest UI
npm run test:cov     # カバレッジ（80% 未満で失敗）
npm run test:e2e     # Playwright
npm run typecheck    # tsc -b（web / server / node）
npm run lint:md      # markdownlint
npm run db:up        # 開発用 PostgreSQL（127.0.0.1:5436）を起動
npm run db:generate  # Drizzle スキーマから SQL マイグレーションを生成
npm run db:migrate   # マイグレーション適用（DATABASE_URL 必須）
npm run dev:api      # API（127.0.0.1:3100、--env-file-if-exists=.env）
npm run dev:worker   # 変換ワーカー
./test/doTest-compose.sh  # 本番相当の 4 コンテナをこの PC で起動して疎通確認
./doDevWindows.sh    # Windows のブラウザでテストする一括起動（--full / --seed / --open / --down）
```

スクリプトの一覧と役割は外側リポジトリの `../docs/08-スクリプト一覧.md`。

サーバのテストは開発用 DB が必要（`npm run db:up`）。`globalSetup` が `tommievoice_test` を作り直してマイグレーションを当てる。
ホストの 3000 / 5432 / 5433 は別プロジェクトが使用中のため、API は 3100、DB は 5436 を使う。

単一テスト実行例: `npm run test:run -- src/App.test.tsx`

**重要**: Claude Code のツール呼び出しシェル（非対話）は `.bashrc` を読まないため、`node`/`npm` を使う Bash 呼び出しでは先頭に
`export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" &&`
を付けて nvm の Node を有効化してから実行する。

## Architecture

SPA。エントリは [index.html](index.html) → [src/main.tsx](src/main.tsx) → [src/App.tsx](src/App.tsx)。`<meta viewport>` は `viewport-fit=cover`、`<html lang="ja">`、**スマホファースト**（iPhone 幅を基準に組み、PC は中央寄せの余白で広げる）。

音声まわりはブラウザ標準の **MediaRecorder API**（録音）と単一の `<audio>` 要素（再生）で実装する。

設計メモと実装計画は**非公開の外側リポジトリ** `../docs/` にある（02〜09）。ブラウザ内文字起こしの計測ページは `/lab/transcribe`（手順は `../docs/05` §7）。サーバは [server/src/app.ts](server/src/app.ts) の `buildApp(deps)` に依存を注入する構成で、テストもこれを使う。Web とサーバの共有コード（zod スキーマ・定数）は [shared/](shared/) に置き、相対 import は `.ts` 拡張子付きで書く。

## Repository structure

- [.claude/](.claude/) — Claude Code 設定（`settings.json` 共有 / `settings.local.json` 個人・gitignore）
- [src/](src/) — React アプリ本体
- [src/test/setup.ts](src/test/setup.ts) — Vitest セットアップ（`jest-dom` matchers）
- [shared/](shared/) — Web / サーバ共有（定数、エンベロープ、zod スキーマ、appVersion）
- [server/](server/) — API・ワーカー（`src/`）、統合テスト基盤（`test/`）、SQL マイグレーション（`drizzle/`）
- [deploy/](deploy/) — Dockerfile、nginx 設定、本番用環境変数テンプレート（`env.example`）
- [e2e/](e2e/) — Playwright
- [compose.yml](compose.yml) / [compose.override.yml](compose.override.yml)（開発）/ [compose.prod.yml](compose.prod.yml)（VPS1）

## Notes

- ファイル編集時の安全フック: `*.env`, `*.env.*`, `*credentials*`, `*secret*` への Edit/Write は `.claude/settings.json` の PreToolUse でブロックされる。そのためソースのファイル名にこれらの語を使わない。環境変数テンプレートは `deploy/env.example`。
- `.env` は人間が作成・編集する。Claude は `.env` の中身を表示しない。サーバは起動時に zod で環境変数を検証し、欠落キー名だけを出して停止する。
- git はブランチを切ってコミットし、`git merge --ff-only` で master に取り込む。
- `git push` は `.claude/settings.local.json` で deny 済み。push が必要なら明示的に許可を求めること。
