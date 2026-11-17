#!/usr/bin/env bash
# Releases each mod whose files changed in a push, as a GitHub release with a zip of the mod.
#
# Usage: release.sh <before-sha> <after-sha>   (before-sha of all zeros or empty: every mod counts as changed)
# Env:   DRY_RUN=1  print what would be released, create nothing
#        ALL=1      treat every mod as changed (manual run)
#
# A mod is a folder holding .claude-plugin/plugin.json. Its release is tagged <mod>-v<version>, the version read
# from that file. A mod that changed without a version bump has its tag already, so it is skipped with a warning.
set -euo pipefail

before="${1:-}"
after="${2:-HEAD}"
zeros='0000000000000000000000000000000000000000'
dist="$(mktemp -d)"

if [ "${ALL:-}" = 1 ] || [ -z "$before" ] || [ "$before" = "$zeros" ] || ! git cat-file -e "$before^{commit}" 2>/dev/null; then
  all=1
else
  all=0
fi

released=()
skipped=()

for manifest in */.claude-plugin/plugin.json; do
  [ -f "$manifest" ] || continue
  mod="${manifest%%/*}"

  if [ "$all" = 0 ] && git diff --quiet "$before" "$after" -- "$mod"; then
    continue
  fi

  version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -1)"
  if [ -z "$version" ]; then
    echo "::warning::$mod: no version in $manifest, skipped"
    skipped+=("$mod (no version)")
    continue
  fi
  tag="$mod-v$version"

  if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
    echo "::warning::$mod changed but $tag already exists: bump the version in $manifest to release it"
    skipped+=("$mod $version (already released)")
    continue
  fi

  zip="$dist/$mod-$version.zip"
  # Tracked files only, so local type stubs and node_modules stay out; tests are not part of the install.
  git archive --format=zip -o "$zip" "$after" "$mod" ":(exclude)$mod/tests"

  if [ "${DRY_RUN:-}" = 1 ]; then
    echo "would release $tag ($(unzip -l "$zip" | tail -1 | awk '{print $2}') files)"
  else
    gh release create "$tag" "$zip" --target "$after" --title "$mod $version" --generate-notes
  fi
  released+=("$tag")
done

{
  echo "### Releases"
  [ ${#released[@]} -gt 0 ] && printf -- '- released `%s`\n' "${released[@]}"
  [ ${#skipped[@]} -gt 0 ] && printf -- '- skipped %s\n' "${skipped[@]}"
  [ ${#released[@]} -eq 0 ] && [ ${#skipped[@]} -eq 0 ] && echo "- no mod changed"
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
exit 0
