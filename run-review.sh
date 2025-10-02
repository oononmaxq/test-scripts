#!/bin/bash
# Next.js Code Reviewer実行スクリプト

# npmスクリプト経由で実行（推奨）
cd "$(dirname "$0")"
npm run review -- "$@"