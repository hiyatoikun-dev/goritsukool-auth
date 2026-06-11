# GPT↔Claude Code ブリッジ

GPTとClaude Codeが直接連携するための中継フォルダです。
**ゴリ（人間）を中継係にしない**ことが設計の最優先事項です。

---

## ディレクトリ構成

```
bridge/
├── README.md           # このファイル
├── status.md           # ブリッジの運用ルール・ステータス
├── outbox.md           # 実行報告ログ
├── watch-bridge.ps1    # 監視スクリプト (Windows PowerShell)
├── inbox/              # GPT → Claude Code 受信トレイ (自動生成)
├── outbox/             # Claude Code → GPT 送信済み (自動生成)
├── logs/               # 実行ログ (自動生成)
└── templates/
    ├── request-template.md   # リクエスト雛形
    ├── response-template.md  # レスポンス雛形
    └── handoff-template.md   # セッション引継ぎ雛形
```

---

## Phase1 運用

- GPTが指示を `bridge/inbox/` に `.md` ファイルとして配置
- Claude Codeが処理後、`bridge/outbox/` に結果を配置
- 手動での受け渡しが必要だったため中継コストが高かった

---

## Phase2 運用

### 目的
ゴリを中継係にしない。GPTとClaude Codeが自律的に通信する。

### 基本フロー

```
GPT
 │  テンプレートを使ってリクエストファイルを作成
 │  bridge/inbox/ に配置
 ↓
watch-bridge.ps1 (常駐監視)
 │  inbox/ の .md ファイルを検知
 │  禁止パターンチェック
 │  処理済みを outbox/ に移動
 ↓
Claude Code
 │  タスクを実行
 │  response-template.md を使って結果を記録
 ↓
GPT
   outbox/ を監視して結果を受け取る
```

### テンプレートの使い方

| シナリオ | 使うテンプレート |
|---|---|
| GPT → Claude へ新規タスクを依頼 | `templates/request-template.md` |
| Claude → GPT へ実行結果を報告 | `templates/response-template.md` |
| セッションをまたいで作業を引継ぐ | `templates/handoff-template.md` |

### watch-bridge.ps1 の起動方法

```powershell
# リポジトリルートで実行
cd goritsukool-auth\bridge
powershell -ExecutionPolicy Bypass -File watch-bridge.ps1

# カスタムパスを指定する場合
powershell -ExecutionPolicy Bypass -File watch-bridge.ps1 `
    -InboxPath "C:\custom\inbox" `
    -OutboxPath "C:\custom\outbox" `
    -IntervalSec 10
```

### Phase2 ルール（抜粋）

- ゴリを中継係にしない
- 実データで成功済みなら追加確認禁止
- Make API失敗導線の再提案禁止
- MCP Toolboxes案の再提案禁止
- 手動操作前チェック必須

> 詳細は `bridge/status.md` を参照してください。

---

## ファイル命名規則

| ファイル種別 | 命名例 |
|---|---|
| リクエスト | `REQ-20260611-001.md` |
| レスポンス | `RES-20260611-001.md` |
| ハンドオフ | `HO-20260611-001.md` |
