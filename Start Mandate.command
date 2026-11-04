#!/bin/zsh
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 22.12 or newer, then run this launcher again.'
  read -r '?Press Return to close.'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci --no-fund --no-audit || exit 1
fi
node scripts/start-local.mjs
