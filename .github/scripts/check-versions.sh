#!/usr/bin/env bash
# Fails when a mod's files changed between two commits but its version in .claude-plugin/plugin.json did not.
# Usage: check-versions.sh <base-sha> <head-sha>
set -euo pipefail
base="$1"
head="${2:-HEAD}"
version() { sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1; }
failed=0
for manifest in */.claude-plugin/plugin.json; do
  [ -f "$manifest" ] || continue
  mod="${manifest%%/*}"
  git diff --quiet "$base" "$head" -- "$mod" && continue
  old="$(git show "$base:$manifest" 2>/dev/null | version || true)"
  new="$(git show "$head:$manifest" | version)"
  if [ -n "$old" ] && [ "$old" = "$new" ]; then
    echo "::error file=$manifest::$mod changed but its version is still $new: bump it in $manifest"
    failed=1
  else
    echo "$mod: ${old:-new} -> $new"
  fi
done
exit $failed
