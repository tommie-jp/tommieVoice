# tommieVoice

声で書き込む掲示板です。スマホから録音して投稿し、ほかの人が聴いて、声で返事をします。文字の掲示板の音声版で、話題ごとにスレッドが分かれます。

配信者向けの「凸待ち箱」もあります。視聴者が届けた声を配信者が文字起こしで下読みし、配信で流すと公開されます。文字起こしは配信者のブラウザ内（WebGPU）で動き、音声を外部の書き起こしサービスへ送りません。

## できること

- 話題ごとのスレッドに声を投稿し、声で返事をする（最大 90 秒）
- 押した投稿から続けて再生、シーク、速度変更
- 投稿の共有 URL（OGP 付き）、自分の投稿の削除、通報
- 凸待ち箱: 配信者だけが聴ける受付、採用・却下・並べ替え、OBS オーバーレイへの再生と字幕表示
- ブラウザ内の文字起こし（Whisper large-v3-turbo / WebGPU）と、要約・タグ・要注意の自動仕分け
- PWA（ホーム画面に追加）

## 構成

| 層         | 技術                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| 画面       | Vite 8 + React 19 + TypeScript 6 + react-router 8（スマホファースト）                            |
| API        | Fastify 5 + zod 4 + Drizzle ORM + PostgreSQL 17 + pg-boss                                        |
| 音声       | MediaRecorder で録音し、ffmpeg で AAC 64 kbps mono の M4A に統一（無音トリム・ラウドネス正規化） |
| 文字起こし | Transformers.js（WebGPU）。ONNX Runtime の wasm は自前配信                                       |
| 配信       | nginx（静的配信・リバースプロキシ）、Docker Compose（db / api / worker / web）                   |
| テスト     | Vitest（単体・統合）、Playwright（iPhone / Android プロファイル）                                |

Node 24 の型ストリップでサーバの TypeScript をそのまま実行します（ビルド不要）。

## 使い方（開発）

```bash
npm ci
./doDevWindows.sh --seed --open     # DB → マイグレーション → API・変換ワーカー・Vite を起動
```

`.env` が無ければ開発用の値で作られます。手動で起動する場合は次のとおりです。

```bash
npm run db:up && npm run db:migrate
npm run dev:api      # API（127.0.0.1:3100）
npm run dev:worker   # 音声変換ワーカー（ffmpeg が必要）
npm run dev          # 画面（127.0.0.1:5173）
```

主なコマンド:

```bash
npm run test:run     # 単体・統合テスト
npm run test:cov     # カバレッジ（80% 未満で失敗）
npm run test:e2e     # Playwright
npm run lint && npm run typecheck
./test/doTest-compose.sh   # 本番相当の 4 コンテナで疎通確認
```

## 配信・デプロイ

`docker compose -f compose.yml -f compose.prod.yml` で db / api / worker / web を起動し、ホストの nginx が TLS を終端して web コンテナへ渡します。開発機からは `./doDeploy-remote.sh` でビルド・転送・マイグレーション・起動までを行います。

必要な環境変数は [deploy/env.example](deploy/env.example) を参照してください。鍵は 32 文字以上で、起動時に検証されます。

## 状態

動作するところまで実装済みです。公開運用はこれからで、ブラウザ内文字起こしの実機計測と本番デプロイが残っています。

設計メモと運用手順は別の非公開リポジトリで管理しています。

## ライセンス

未定です。
