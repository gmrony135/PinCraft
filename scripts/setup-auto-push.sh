#!/usr/bin/env bash
set -eu
cd "$(git rev-parse --show-toplevel)"
[ "$(git remote get-url origin)" = 'https://github.com/gmrony135/PinCraft.git' ] || { echo 'Unexpected repository; not enabling auto-push.' >&2; exit 1; }
chmod +x .githooks/post-commit
git config core.hooksPath .githooks
git config pincraft.autoPush true
if [ -n "${PINCRAFT_DEPLOY_KEY:-}" ]; then
  [ -f "$PINCRAFT_DEPLOY_KEY" ] || exit 1
  git config url."git@github.com:gmrony135/PinCraft.git".insteadOf "https://github.com/gmrony135/PinCraft.git"
  git config core.sshCommand "ssh -i $PINCRAFT_DEPLOY_KEY -o IdentitiesOnly=yes"
fi
echo 'Commit auto-push enabled. For debounced source-change commits, run: node scripts/watch-auto-push.mjs'
