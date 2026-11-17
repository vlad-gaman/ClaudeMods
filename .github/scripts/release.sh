#!/usr/bin/env bash
# Makes one GitHub release for a push when at least one mod changed. The release holds a zip of every mod (the
# whole set as of this commit) and its notes list the mods that changed, with their versions.
#
# Usage: release.sh <before-sha> <after-sha>   (before-sha of all zeros or empty: every mod counts as changed)
# Env:   DRY_RUN=1  print what would be released, create nothing
#        ALL=1      treat every mod as changed (manual run)
#
# A mod is a folder holding .claude-plugin/plugin.json. The release tag is release-<date>-<short sha>. A mod that
# changed without a version bump is flagged in the notes and a warning; the pull request check prevents it.
set -euo pipefail

before="${1:-}"
after="${2:-HEAD}"
zeros='0000000000000000000000000000000000000000'
dist="$(mktemp -d)"
version() { sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1; }

if [ "${ALL:-}" = 1 ] || [ -z "$before" ] || [ "$before" = "$zeros" ] || ! git cat-file -e "$before^{commit}" 2>/dev/null; then
  all=1
else
  all=0
fi

changed=()
notes="$dist/notes.md"
: > "$notes"

for manifest in */.claude-plugin/plugin.json; do
  [ -f "$manifest" ] || continue
  mod="${manifest%%/*}"
  new="$(git show "$after:$manifest" | version)"
  if [ -z "$new" ]; then
    echo "::warning::$mod: no version in $manifest"
    continue
  fi

  # Tracked files only, so local type stubs and node_modules stay out; tests are not part of the install.
  git archive --format=zip -o "$dist/$mod-$new.zip" "$after" "$mod" ":(exclude)$mod/tests"

  if [ "$all" = 0 ] && git diff --quiet "$before" "$after" -- "$mod"; then
    continue
  fi
  old=""
  [ "$all" = 0 ] && old="$(git show "$before:$manifest" 2>/dev/null | version || true)"
  if [ -n "$old" ] && [ "$old" = "$new" ]; then
    echo "::warning::$mod changed but its version is still $new: bump it in $manifest"
    changed+=("$mod $new (changed, version not bumped)")
  elif [ -n "$old" ]; then
    changed+=("$mod $old -> $new")
  else
    changed+=("$mod $new")
  fi
done

if [ ${#changed[@]} -eq 0 ]; then
  echo "No mod changed, no release."
  exit 0
fi

tag="release-$(date -u +%Y%m%d)-$(git rev-parse --short "$after")"
{
  echo "Changed mods:"
  echo
  printf -- '- %s\n' "${changed[@]}"
  echo
  echo "Each zip is one mod. Unzip it and load the folder with \`claude --plugin-dir ./<mod>\`."
} > "$notes"

if [ "${DRY_RUN:-}" = 1 ]; then
  echo "would release $tag with $(ls "$dist"/*.zip | wc -l) zips"
  cat "$notes"
elif gh release view "$tag" >/dev/null 2>&1; then
  echo "::warning::$tag already exists, skipped"
else
  gh release create "$tag" "$dist"/*.zip --target "$after" --title "Mods $(date -u +%Y-%m-%d) ($(git rev-parse --short "$after"))" --notes-file "$notes" --generate-notes
fi

{
  echo "### Release $tag"
  printf -- '- %s\n' "${changed[@]}"
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
exit 0
