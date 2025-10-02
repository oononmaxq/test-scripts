# Next.js Code Reviewer

Next.jsプロジェクト向けの自動コードレビューツール。TypeScriptとReact/Next.js特有の問題を検出し、コード品質を向上させます。

## 機能

### 検出する問題

#### TypeScript関連
- `any`型の使用
- 非null断言演算子（!）の使用
- 浮遊Promise（未処理のPromise）
- 不要なawait
- 高い循環的複雑度（10以上）
- 長すぎる関数（50行以上）

#### React/Next.js関連
- 条件付きフックの呼び出し
- `next/image`の代わりに`<img>`タグの使用
- `next/link`の代わりに`<a>`タグの使用
- ハードコードされたテキスト（i18n化推奨）
- ページでのデータフェッチング方法

#### コード品質
- console文の検出
- TODO/FIXMEコメント
- 長すぎる行（120文字以上）
- 重複したimport文
- 末尾の空白

## インストール

```bash
npm install
```

## 使用方法

### 現在のディレクトリをレビュー
```bash
# developブランチと比較（デフォルト）
npm run review

# 別のブランチと比較
npm run review:main  # mainブランチと比較
tsx nextjs-code-reviewer.ts main  # 任意のブランチと比較
```

### 特定のプロジェクトをレビュー
```bash
# 特定のプロジェクトをdevelopと比較
tsx nextjs-code-reviewer.ts /Users/oono/projects/cyber-academia-kids

# 相対パスも使用可能
tsx nextjs-code-reviewer.ts ../cyber-academia-kids

# 特定のプロジェクトを指定ブランチと比較
tsx nextjs-code-reviewer.ts /Users/oono/projects/cyber-academia-kids main
```

### グローバルインストール（推奨）
```bash
# グローバルインストール
cd /Users/oono/projects/test-scripts
npm install -g .

# 任意の場所から実行
cd /Users/oono/projects/cyber-academia-kids
nextjs-review  # developと比較
nextjs-review main  # mainと比較
```

## 出力

レビュー結果は`review_YYYYMMDDHHMMSS.md`形式のファイルに出力されます。

### レポート内容
- 変更されたファイル数
- 検出された問題の総数
- 重要度別の問題数（エラー、警告、情報）
- ファイルごとの詳細な問題リスト

### 重要度レベル
- 🔴 **エラー**: 修正が必要な重大な問題
- 🟡 **警告**: 修正を推奨する問題
- 🔵 **情報**: 改善の余地がある項目

## カスタマイズ

コードレビューのルールを追加・変更する場合は、`nextjs-code-reviewer.ts`の以下のメソッドを編集してください：

- `checkTypeScriptIssues()`: TypeScript関連のチェック
- `checkReactNextJSIssues()`: React/Next.js関連のチェック
- `checkGeneralCodeQuality()`: 一般的なコード品質チェック

## 要件

- Node.js 18以上
- Git（リポジトリ内で実行）
- TypeScript 5.0以上