#!/usr/bin/env node

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { ESLint } from 'eslint';

interface Review {
  file: string;
  line: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
}

interface ReviewStats {
  totalFiles: number;
  totalIssues: number;
  errors: number;
  warnings: number;
  info: number;
}

class NextJSCodeReviewer {
  private reviews: Review[] = [];
  private changedFiles: string[] = [];
  private baseBranch: string;

  constructor(baseBranch: string = 'develop') {
    this.baseBranch = baseBranch;
  }

  async runReview(projectPath?: string): Promise<void> {
    const originalDir = process.cwd();
    
    try {
      if (projectPath) {
        const absolutePath = path.isAbsolute(projectPath) ? projectPath : path.resolve(originalDir, projectPath);
        console.log(`📁 プロジェクトディレクトリに移動: ${absolutePath}`);
        process.chdir(absolutePath);
      }
      
      console.log('🔍 Next.jsコードレビューを開始します...\n');
      console.log(`📂 プロジェクト: ${process.cwd()}`);
      console.log(`🌿 ベースブランチ: ${this.baseBranch}\n`);
      
      this.getChangedFiles();
      
      if (this.changedFiles.length === 0) {
        console.log('現在のブランチと' + this.baseBranch + 'の間に変更されたファイルが見つかりません');
        return;
      }

      console.log(`${this.changedFiles.length}個の変更されたファイルを検出\n`);

      for (const file of this.changedFiles) {
        if (this.shouldReviewFile(file)) {
          await this.reviewFile(file);
        }
      }

      this.generateReport();
    } catch (error) {
      console.error('コードレビュー中にエラーが発生しました:', error);
      process.exit(1);
    } finally {
      if (projectPath) {
        process.chdir(originalDir);
      }
    }
  }

  private getChangedFiles(): void {
    try {
      const mergeBase = execSync(`git merge-base HEAD ${this.baseBranch}`, { encoding: 'utf-8' }).trim();
      const diff = execSync(`git diff --name-only ${mergeBase}...HEAD`, { encoding: 'utf-8' });
      this.changedFiles = diff.trim().split('\n').filter(f => f.length > 0);
    } catch (error) {
      console.error(`Git差分の取得に失敗しました。Gitリポジトリ内で実行しているか、${this.baseBranch}ブランチが存在するか確認してください。`);
      throw error;
    }
  }

  private shouldReviewFile(filePath: string): boolean {
    const ext = path.extname(filePath);
    const reviewableExtensions = ['.ts', '.tsx', '.js', '.jsx'];
    const excludePaths = ['node_modules', '.next', 'dist', 'build', 'coverage'];
    
    return reviewableExtensions.includes(ext) && 
           !excludePaths.some(exclude => filePath.includes(exclude));
  }

  private async reviewFile(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      console.log(`削除されたファイルをスキップ: ${filePath}`);
      return;
    }

    console.log(`レビュー中: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    await this.checkTypeScriptIssues(filePath, content);
    await this.checkReactNextJSIssues(filePath, content);
    await this.checkGeneralCodeQuality(filePath, content);
  }

  private async checkTypeScriptIssues(filePath: string, content: string): Promise<void> {
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      
      if (line.includes(': any') || line.includes('<any>') || line.includes(' as any')) {
        this.addReview({
          file: filePath,
          line: lineNum,
          severity: 'error',
          rule: 'no-any',
          message: '"any"型の使用は避けてください。具体的な型を使用してください。'
        });
      }
      
      if (line.includes('!.') || line.includes('!;')) {
        this.addReview({
          file: filePath,
          line: lineNum,
          severity: 'warning',
          rule: 'no-non-null-assertion',
          message: '非null断言(!)の使用は避けてください。適切なnullチェックを検討してください。'
        });
      }
      
      if (/\.then\s*\(/.test(line) && !line.includes('await') && !line.includes('return')) {
        this.addReview({
          file: filePath,
          line: lineNum,
          severity: 'error',
          rule: 'floating-promises',
          message: '未処理のPromiseを検出しました。awaitを使用するか、適切にPromiseを処理してください。'
        });
      }
      
      if (/await\s+[^(]/.test(line) && !/(async|await\s+\w+\()/.test(line)) {
        const awaitMatch = line.match(/await\s+(\w+)/);
        if (awaitMatch) {
          const possibleVar = awaitMatch[1];
          if (!/Promise|fetch|async/.test(possibleVar)) {
            this.addReview({
              file: filePath,
              line: lineNum,
              severity: 'warning',
              rule: 'unnecessary-await',
              message: '不要なawaitの可能性があります。Promiseを返すか確認してください。'
            });
          }
        }
      }
      
      if (/console\.(log|error|warn|info|debug)/.test(line)) {
        this.addReview({
          file: filePath,
          line: lineNum,
          severity: 'warning',
          rule: 'no-console',
          message: '本番環境前にconsole文を削除してください。'
        });
      }
      
      if (/\/\/\s*(TODO|FIXME|HACK|XXX)/.test(line)) {
        this.addReview({
          file: filePath,
          line: lineNum,
          severity: 'info',
          rule: 'todo-comments',
          message: `${line.match(/TODO|FIXME|HACK|XXX/)?.[0]}コメントが見つかりました。対応が必要です。`
        });
      }
    });
    
    this.checkFunctionComplexity(filePath, content);
  }

  private checkFunctionComplexity(filePath: string, content: string): void {
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const checkNode = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) {
        const functionBody = node.body;
        if (functionBody && ts.isBlock(functionBody)) {
          const lineCount = functionBody.statements.length;
          const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          
          if (lineCount > 50) {
            this.addReview({
              file: filePath,
              line: startLine,
              severity: 'warning',
              rule: 'max-lines-per-function',
              message: `関数が長すぎます（${lineCount}文）。より小さな関数に分割することを検討してください。`
            });
          }
          
          const complexity = this.calculateCyclomaticComplexity(functionBody);
          if (complexity > 10) {
            this.addReview({
              file: filePath,
              line: startLine,
              severity: 'warning',
              rule: 'cyclomatic-complexity',
              message: `関数の循環的複雑度が高いです（${complexity}）。簡略化を検討してください。`
            });
          }
        }
      }
      
      ts.forEachChild(node, checkNode);
    };

    checkNode(sourceFile);
  }

  private calculateCyclomaticComplexity(node: ts.Node): number {
    let complexity = 1;
    
    const visit = (n: ts.Node) => {
      switch (n.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.ConditionalExpression:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.CatchClause:
          complexity++;
          break;
        case ts.SyntaxKind.CaseClause:
          if ((n as ts.CaseClause).statements.length > 0) {
            complexity++;
          }
          break;
        case ts.SyntaxKind.BinaryExpression:
          const op = (n as ts.BinaryExpression).operatorToken.kind;
          if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) {
            complexity++;
          }
          break;
      }
      ts.forEachChild(n, visit);
    };
    
    visit(node);
    return complexity;
  }

  private async checkReactNextJSIssues(filePath: string, content: string): Promise<void> {
    const lines = content.split('\n');
    
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.jsx')) {
      return;
    }
    
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      
      if (/use(State|Effect|Callback|Memo|Reducer|Context|LayoutEffect|ImperativeHandle|DebugValue)/.test(line)) {
        if (/if\s*\(|for\s*\(|while\s*\(|}\s*else/.test(lines.slice(Math.max(0, index - 3), index).join('\n'))) {
          this.addReview({
            file: filePath,
            line: lineNum,
            severity: 'error',
            rule: 'hooks-conditional',
            message: 'React Hookが条件付きで呼び出されているようです。Hookは毎回同じ順序で呼び出す必要があります。'
          });
        }
      }
      
      if (/<img\s+src=/.test(line) && filePath.includes('/pages/') || filePath.includes('/app/')) {
        this.addReview({
          file: filePath,
          line: lineNum,
          severity: 'warning',
          rule: 'next-image',
          message: 'パフォーマンス向上のため、<img>の代わりにnext/imageを使用してください。'
        });
      }
      
      if (/<a\s+href=/.test(line) && !/<a\s+href=["']https?:/.test(line)) {
        this.addReview({
          file: filePath,
          line: lineNum,
          severity: 'warning',
          rule: 'next-link',
          message: '内部ナビゲーションには<a>の代わりにnext/linkを使用してください。'
        });
      }
      
      const hardcodedTextMatch = line.match(/>([^<>{}\n]+[a-zA-Z]+[^<>{}\n]+)</);
      if (hardcodedTextMatch && hardcodedTextMatch[1].trim().length > 3) {
        const text = hardcodedTextMatch[1].trim();
        if (!/^\{.*\}$/.test(text) && !/^[A-Z_]+$/.test(text)) {
          this.addReview({
            file: filePath,
            line: lineNum,
            severity: 'info',
            rule: 'i18n-hardcoded',
            message: `ハードコードされたテキストにはi18nの使用を検討してください: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`
          });
        }
      }
    });
    
    if (filePath.includes('/pages/') && !content.includes('getStaticProps') && !content.includes('getServerSideProps') && !content.includes('getStaticPaths')) {
      const hasDataFetching = /fetch\(|axios\.|useQuery|useSWR/.test(content);
      if (hasDataFetching) {
        this.addReview({
          file: filePath,
          line: 1,
          severity: 'info',
          rule: 'next-data-fetching',
          message: 'ページでのデータ取得にはgetStaticPropsまたはgetServerSidePropsの使用を検討してください。'
        });
      }
    }
  }

  private async checkGeneralCodeQuality(filePath: string, content: string): Promise<void> {
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      
      if (line.length > 120) {
        this.addReview({
          file: filePath,
          line: lineNum,
          severity: 'info',
          rule: 'max-line-length',
          message: `行が長すぎます（${line.length}文字）。改行を検討してください。`
        });
      }
      
      if (/\s+$/.test(line)) {
        this.addReview({
          file: filePath,
          line: lineNum,
          severity: 'info',
          rule: 'no-trailing-spaces',
          message: '末尾の空白が検出されました。'
        });
      }
    });
    
    const importLines = lines.filter(line => line.startsWith('import'));
    const duplicateImports = new Set();
    const importModules = new Map<string, number>();
    
    importLines.forEach((line, index) => {
      const moduleMatch = line.match(/from ['"]([^'"]+)['"]/);
      if (moduleMatch) {
        const module = moduleMatch[1];
        if (importModules.has(module)) {
          duplicateImports.add(module);
        } else {
          importModules.set(module, lines.indexOf(line) + 1);
        }
      }
    });
    
    duplicateImports.forEach(module => {
      this.addReview({
        file: filePath,
        line: importModules.get(module as string)!,
        severity: 'warning',
        rule: 'no-duplicate-imports',
        message: `"${module as string}"からの重複したインポートです。同じモジュールからのインポートをまとめてください。`
      });
    });
  }

  private addReview(review: Review): void {
    this.reviews.push(review);
  }

  private generateReport(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').substring(0, 15);
    const resultDir = path.join('/Users/oono/projects/test-scripts', 'result');
    
    // 結果ディレクトリが存在しない場合は作成
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }
    
    const filename = path.join(resultDir, `review_${timestamp}.md`);
    
    // 現在のブランチ名を取得
    let currentBranch = 'unknown';
    try {
      currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    } catch (error) {
      // Gitリポジトリ外で実行された場合は無視
    }
    
    const stats: ReviewStats = {
      totalFiles: this.changedFiles.filter(f => this.shouldReviewFile(f)).length,
      totalIssues: this.reviews.length,
      errors: this.reviews.filter(r => r.severity === 'error').length,
      warnings: this.reviews.filter(r => r.severity === 'warning').length,
      info: this.reviews.filter(r => r.severity === 'info').length
    };
    
    const groupedReviews = this.groupReviewsBySeverity();
    
    let report = `# Next.js コードレビューレポート\n\n`;
    report += `**生成日時:** ${new Date().toISOString()}\n`;
    report += `**現在のブランチ:** ${currentBranch}\n`;
    report += `**比較対象ブランチ:** ${this.baseBranch}\n`;
    report += `**レビュー対象ファイル数:** ${stats.totalFiles}\n`;
    report += `**検出された問題の総数:** ${stats.totalIssues}\n\n`;
    
    report += `## サマリー\n\n`;
    report += `- 🔴 エラー: ${stats.errors}\n`;
    report += `- 🟡 警告: ${stats.warnings}\n`;
    report += `- 🔵 情報: ${stats.info}\n\n`;
    
    if (stats.errors > 0) {
      report += `## 🔴 エラー (${stats.errors})\n\n`;
      report += this.formatReviews(groupedReviews.error);
    }
    
    if (stats.warnings > 0) {
      report += `## 🟡 警告 (${stats.warnings})\n\n`;
      report += this.formatReviews(groupedReviews.warning);
    }
    
    if (stats.info > 0) {
      report += `## 🔵 情報 (${stats.info})\n\n`;
      report += this.formatReviews(groupedReviews.info);
    }
    
    report += `## 適用されたレビュールール\n\n`;
    report += `### TypeScript関連\n`;
    report += `- ✅ no-any: any型の使用を禁止\n`;
    report += `- ✅ no-non-null-assertion: 非null断言(!)の使用を回避\n`;
    report += `- ✅ floating-promises: 未処理のPromiseを検出\n`;
    report += `- ✅ unnecessary-await: 不要なawaitの使用をチェック\n`;
    report += `- ✅ cyclomatic-complexity: 複雑度が10を超える関数\n`;
    report += `- ✅ max-lines-per-function: 50行を超える関数\n\n`;
    
    report += `### React/Next.js関連\n`;
    report += `- ✅ hooks-conditional: 条件付きで呼び出されるフックを検出\n`;
    report += `- ✅ next-image: imgタグよりnext/imageを推奨\n`;
    report += `- ✅ next-link: 内部ナビゲーションにはnext/linkを推奨\n`;
    report += `- ✅ i18n-hardcoded: ハードコードされたテキストを検出\n`;
    report += `- ✅ next-data-fetching: データ取得にSSR/SSGを提案\n\n`;
    
    report += `### コード品質\n`;
    report += `- ✅ no-console: console文を検出\n`;
    report += `- ✅ todo-comments: TODO/FIXMEコメントを検出\n`;
    report += `- ✅ max-line-length: 120文字を超える行\n`;
    report += `- ✅ no-duplicate-imports: 重複したインポートを検出\n`;
    
    fs.writeFileSync(filename, report);
    const fullPath = path.resolve(process.cwd(), filename);
    console.log(`\n✅ レビューレポートを生成しました: ${fullPath}`);
  }

  private groupReviewsBySeverity(): { [key: string]: Review[] } {
    const grouped: { [key: string]: Review[] } = {
      error: [],
      warning: [],
      info: []
    };
    
    this.reviews.forEach(review => {
      grouped[review.severity].push(review);
    });
    
    return grouped;
  }

  private formatReviews(reviews: Review[]): string {
    let output = '';
    const byFile = new Map<string, Review[]>();
    
    reviews.forEach(review => {
      if (!byFile.has(review.file)) {
        byFile.set(review.file, []);
      }
      byFile.get(review.file)!.push(review);
    });
    
    byFile.forEach((fileReviews, file) => {
      output += `### \`${file}\`\n\n`;
      fileReviews.sort((a, b) => a.line - b.line);
      
      fileReviews.forEach(review => {
        output += `- **${review.line}行目** [\`${review.rule}\`]: ${review.message}\n`;
      });
      output += '\n';
    });
    
    return output;
  }
}

// コマンドライン引数の処理
// 使い方:
// tsx nextjs-code-reviewer.ts                                    # 現在のディレクトリをdevelopと比較
// tsx nextjs-code-reviewer.ts /path/to/project                   # 指定プロジェクトをdevelopと比較
// tsx nextjs-code-reviewer.ts /path/to/project main              # 指定プロジェクトをmainと比較
// tsx nextjs-code-reviewer.ts main                               # 現在のディレクトリをmainと比較

const args = process.argv.slice(2);
let projectPath: string | undefined;
let baseBranch = 'develop';

if (args.length === 1) {
  // 1引数の場合、パスかブランチ名かを判定
  if (args[0].includes('/') || args[0].includes('\\') || fs.existsSync(args[0])) {
    projectPath = args[0];
  } else {
    baseBranch = args[0];
  }
} else if (args.length >= 2) {
  projectPath = args[0];
  baseBranch = args[1];
}

const reviewer = new NextJSCodeReviewer(baseBranch);
reviewer.runReview(projectPath);