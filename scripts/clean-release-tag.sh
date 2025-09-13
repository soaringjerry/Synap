#!/usr/bin/env bash
set -euo pipefail

# Local pre-clean for semantic-release tag conflicts.
# - Fetches/prunes tags
# - Dry-runs semantic-release to find NEXT
# - If local tag vNEXT exists but is not on current history, delete it
#
# Remote tag cleanup is handled in CI (versioning.yml). We avoid pushing from local here.

echo "[release-pre] syncing tags..."
git fetch --tags --force --prune || true

echo "[release-pre] computing next version (dry-run)..."
NEXT=$(npx semantic-release --dry-run 2>&1 | sed -n "s/.*The next release version is \([0-9]\+\.[0-9]\+\.[0-9]\+\).*/\1/p" | tail -n1 || true)

if [[ -z "${NEXT}" ]]; then
  echo "[release-pre] could not determine next version (no changes or missing token); skipping local tag cleanup."
  exit 0
fi

echo "[release-pre] next version: ${NEXT}"

if git rev-parse -q --verify "refs/tags/v${NEXT}" >/dev/null 2>&1; then
  TSHA=$(git rev-parse -q --verify "refs/tags/v${NEXT}^{commit}" || true)
  if [[ -n "${TSHA}" ]]; then
    if git merge-base --is-ancestor "${TSHA}" HEAD; then
      echo "[release-pre] local tag v${NEXT} exists on current history; leaving it."
    else
      echo "[release-pre] local tag v${NEXT} exists but is not on current history; deleting local tag."
      git tag -d "v${NEXT}" || true
    fi
  fi
fi

echo "[release-pre] done."

