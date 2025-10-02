# Next.jsコードレビュー - ブランチ比較情報

## 概要
このNext.jsコードレビューツールは、現在のGitブランチと指定されたベースブランチ（デフォルトは`develop`）の差分を分析し、PRレビューと同等の内容をレビューします。

## ブランチ比較の仕組み

### 1. 比較対象の決定
コードレビューツールは以下の手順でブランチ間の差分を取得します：

```bash
# 1. 現在のブランチとベースブランチの共通祖先を見つける
git merge-base HEAD develop

# 2. 共通祖先から現在のブランチまでの変更ファイルを取得
git diff --name-only <merge-base>...HEAD
```

### 2. 動作の詳細
- `git merge-base`: 2つのブランチが分岐した地点（共通の祖先コミット）を特定
- `git diff`: その分岐点から現在のブランチ（HEAD）までに変更されたファイルをリスト化
- これにより、PRで表示される差分と同じ内容をレビュー対象として取得

### 3. デフォルトブランチ
- デフォルトのベースブランチ: `develop`
- カスタマイズ可能: コマンドライン引数で別のブランチを指定可能

## 使用方法

### 基本的な使い方
```bash
# 現在のディレクトリでdevelopブランチと比較
tsx nextjs-code-reviewer.ts

# 指定プロジェクトでdevelopブランチと比較
tsx nextjs-code-reviewer.ts /path/to/project

# 指定プロジェクトでmainブランチと比較
tsx nextjs-code-reviewer.ts /path/to/project main

# 現在のディレクトリでmainブランチと比較
tsx nextjs-code-reviewer.ts main
```

### 引数の解釈ルール
- 1引数の場合：
  - パス区切り文字（`/`または`\`）を含む、または実在するパスの場合 → プロジェクトパス
  - それ以外 → ベースブランチ名
- 2引数の場合：
  - 第1引数：プロジェクトパス
  - 第2引数：ベースブランチ名

## レビュー対象
以下の条件を満たすファイルがレビュー対象となります：

### 対象拡張子
- `.ts` (TypeScript)
- `.tsx` (TypeScript React)
- `.js` (JavaScript)
- `.jsx` (JavaScript React)

### 除外パス
以下のディレクトリ内のファイルは自動的に除外されます：
- `node_modules`
- `.next`
- `dist`
- `build`
- `coverage`

## 出力
レビュー結果は以下の形式で保存されます：
- 保存先: `/Users/oono/projects/test-scripts/result/`
- ファイル名: `review_YYYYMMDDTHHMMSS.md`
- 内容: ベースブランチ名、検出された問題の詳細、適用されたルールの一覧