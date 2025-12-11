# Cloudflare デプロイガイド

このプロジェクトをCloudflareにデプロイするためのガイドです。

## 推奨サービス: Cloudflare Pages

このプロジェクトは静的サイト（HTML/JS/CSS）であるため、**Cloudflare Pages** の利用を強く推奨します。

### 理由
*   **静的サイトに最適化**: HTMLなどの静的ファイルの配信に特化しており、高速です。
*   **設定が簡単**: ビルド設定なしで、ディレクトリをアップロードするだけで公開できます。
*   **無料枠が大きい**: 個人開発であれば無料プランで十分運用可能です。
*   **Git連携**: GitHubにプッシュするだけで自動デプロイできます。

## 環境変数の設定（AI機能用）

AIによる高品質な画像生成機能を利用するには、Cloudflare Pagesのダッシュボードで以下の環境変数を設定する必要があります。

1. Cloudflare Dashboardでプロジェクトを選択します。
2. **Settings** > **Environment variables** に移動します。
3. 以下の変数を追加します（Production と Preview の両方に追加することを推奨）：

| 変数名 | 説明 | 例 |
| :--- | :--- | :--- |
| `GOOGLE_API_KEY` | Google AI Studio (Gemini) のAPIキー | `AIzaSy...` |
| `ACCESS_PASSWORD` | AI機能の利用制限用パスワード | `SecretPassword123` |

※ `ACCESS_PASSWORD` が設定されていない場合、またはユーザーが間違ったパスワードを入力した場合、AI機能は動作せず、自動的に簡易版（ブラウザ内描画）に切り替わります。

---

## 方法1: GitHub連携（推奨）

最も一般的で管理しやすい方法です。

1.  GitHubにこのリポジトリをプッシュします（まだの場合）。
2.  [Cloudflare Dashboard](https://dash.cloudflare.com/) にログインします。
3.  左メニューから **Workers & Pages** > **Overview** を選択します。
4.  **Create application** > **Pages** タブ > **Connect to Git** をクリックします。
5.  GitHubアカウントを接続し、このリポジトリを選択します。
6.  セットアップ画面で以下の設定を行います：
    *   **Project name**: `personal-color-analyzer`（任意）
    *   **Production branch**: `main`
    *   **Framework preset**: `None`（フレームワーク不使用のため）
    *   **Build command**: （空欄のまま）
    *   **Build output directory**: （空欄のまま、または `.`）
7.  **Save and Deploy** をクリックします。

これで、`https://personal-color-analyzer.pages.dev` のようなURLでサイトが公開されます。

---

## 方法2: CLIからの直接デプロイ（手動）

GitHubを経由せず、コマンドラインから直接デプロイする方法です。

### 準備
プロジェクトのルートディレクトリで以下のコマンドを実行し、必要なツールをインストール済みです。
```bash
npm install
```

### デプロイ手順

1.  Cloudflareにログインします（初回のみ）。
    ```bash
    npx wrangler login
    ```
    ブラウザが開き、認証が求められます。

2.  デプロイを実行します。
    ```bash
    npm run deploy
    ```
    または直接コマンドを実行：
    ```bash
    npx wrangler pages deploy .
    ```

3.  コマンドの指示に従い、新しいプロジェクトを作成するか、既存のプロジェクトを選択します。
    *   Project Name: `personal-color-analyzer`

---

## ローカルでのプレビュー

Cloudflare Pagesの環境をローカルでシミュレートして確認できます。

```bash
npm run dev
```
または
```bash
npx wrangler pages dev .
```

ブラウザで `http://localhost:8788` にアクセスして確認してください。
