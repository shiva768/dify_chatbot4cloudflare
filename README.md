# Slack Dify Bot

Slackと[Dify](https://dify.ai/)を連携させるCloudflare Workersベースのボットです。SlackのスレッドとDifyのコンバセーションを紐づけ、会話の履歴を保持します。

## 機能

- Slackメンションに対してDifyのAIレスポンスを返す
- スレッド内での会話履歴の保持
- KVストレージを使ったスレッドとDify会話の紐付け
- （予定）複数ワークスペース対応
- （予定）エラーハンドリング／リトライ機能

## 前提条件

- Node.js 18以上
- Cloudflareアカウント
- Slackワークスペース（管理者権限）
- DifyアカウントとAPIキー

## セットアップ手順

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.dev.vars`ファイルを作成し、以下の環境変数を設定します：

```env
SLACK_BOT_TOKEN=Bearer xoxb-your_slack_bot_token
DIFY_API_KEY=Bearer v1a-your_dify_api_key
DIFY_APP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
THREAD_LIFETIME_SEC=43200  # 任意。デフォルト12時間
```

### 3. Cloudflare Workersの設定

1. Cloudflareダッシュボードで新しいWorkersプロジェクトを作成
2. KVネームスペースを作成し、THREAD_MAP というバインド名で設定（ダッシュボードの Namespace ID を wrangler.toml の id /
   preview_id に記載）
3. 以下のコマンドでデプロイ：

```bash
npx wrangler deploy
```

### 4. Slackアプリの設定

1. [Slack API](https://api.slack.com/apps)で新しいアプリを作成
2. 以下の権限を追加：
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`
   - `im:history   # DM対応をする場合`
   - `groups:history   # プライベートチャンネルで使う場合`
3. イベントサブスクリプションを有効化し、`app_mention, message.channels  # スレッド内の投稿も処理`イベントを購読
4. アプリをワークスペースにインストール

## 使用方法

1. ボットをメンション（`@ボット名`）で呼び出します
2. スレッド内で会話を続けることができます
3. 会話履歴は自動的に保持されます

## トラブルシューティング

### よくある問題

1. **ボットが応答しない**
   - Slackアプリの権限設定を確認
   - 環境変数が正しく設定されているか確認

2. **会話履歴が保持されない**
   - KVストレージの設定を確認
   - Cloudflare Workersのログを確認

3. **Dify APIエラー**
   - APIキーが正しいか確認
   - API URLが正しいか確認

## 開発

### ローカル開発

```bash
npx wrangler dev --kv THREAD_MAP=e16c90e9179c489aa3296b09857b765b
```

### テスト

```bash
npm test
```

## ライセンス

MIT

## 貢献

プルリクエストやイシューの報告は大歓迎です。大きな変更を加える場合は、まずイシューで議論してください。
