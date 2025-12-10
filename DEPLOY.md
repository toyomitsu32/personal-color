# GitHub Pages デプロイ手順

## 1. GitHubリポジトリの作成

1. GitHubにログイン
2. 新しいリポジトリを作成
   - リポジトリ名: `personal-color-analyzer`（任意）
   - Public または Private
   - README.md は追加しない（既にあるため）

## 2. ローカルでGit初期化とプッシュ

```bash
# プロジェクトディレクトリで実行
git init
git add .
git commit -m "Initial commit: AI Personal Color Analyzer"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/personal-color-analyzer.git
git push -u origin main
```

## 3. GitHub Pages の設定

1. GitHubリポジトリのページを開く
2. **Settings** タブをクリック
3. 左サイドバーの **Pages** をクリック
4. **Source** セクションで:
   - Source: `GitHub Actions` を選択
5. 自動的にデプロイが開始されます

## 4. デプロイの確認

- **Actions** タブでデプロイの進行状況を確認
- 完了後、`https://YOUR_USERNAME.github.io/personal-color-analyzer/` でアクセス可能

## 5. 自動デプロイ

- `main` ブランチにプッシュするたびに自動でデプロイされます
- `.github/workflows/deploy.yml` で設定済み

## トラブルシューティング

### ファビコンが表示されない
- ブラウザのキャッシュをクリア（Ctrl+Shift+R / Cmd+Shift+R）
- Data URI形式なので通常は問題なく表示されます

### デプロイが失敗する
1. リポジトリの Settings > Actions > General
2. **Workflow permissions** を `Read and write permissions` に変更
3. 再度プッシュして確認

### パスの問題
- 静的サイトなので、すべて相対パスで記述済み
- サブディレクトリでのデプロイにも対応

## ローカルでのテスト

```bash
# 簡易サーバーを起動（Python）
python3 -m http.server 8000

# または Node.js
npx http-server .

# ブラウザで http://localhost:8000 にアクセス
```

## カスタムドメインの設定（オプション）

1. Settings > Pages
2. **Custom domain** に独自ドメインを入力
3. DNSレコードを設定（GitHubの指示に従う）
