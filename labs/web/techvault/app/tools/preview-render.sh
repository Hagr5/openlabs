#!/bin/sh
# =============================================================================
# preview-render.sh — internal helper invoked by techvault-api's preview
# service (previewService.js). NOT part of the player-facing API surface —
# players never see, call, or know this file exists. It is simply the
# "legitimate tool" the backend shells out to when rendering a preview.
#
# This script itself contains NO vulnerability. The intended
# command-injection vulnerability lives entirely in how techvault-api
# BUILDS the shell command line before this script (or anything else on
# that line) ever runs — see previewService.js.
#
# Behavior:
#   --format=<html|text>   cosmetic only, echoed back
#   --source="<value>"     the (simulated) source to preview
#
# This script performs NO real network access. It simulates a preview
# render against a small set of known local fixtures so the challenge
# stays fully deterministic across resets (no live HTTP dependency).
# =============================================================================

set -eu

FORMAT="html"
SOURCE=""

for arg in "$@"; do
  case "$arg" in
    --format=*) FORMAT="${arg#--format=}" ;;
    --source=*) SOURCE="${arg#--source=}" ;;
  esac
done

if [ -z "$SOURCE" ]; then
  echo "preview-render: error: --source is required" >&2
  exit 1
fi

# Simulated, deterministic "rendering" — no outbound requests, no dynamic
# behavior beyond echoing a fixed template. Any *actual* command execution
# that occurs alongside this script running is happening because the
# caller (previewService.js) handed the whole line to `sh -c`, not because
# this script does anything unsafe with $SOURCE.
case "$FORMAT" in
  html)
    printf '<div class="preview"><p>Preview generated for: %s</p></div>\n' "$SOURCE"
    ;;
  text)
    printf 'Preview generated for: %s\n' "$SOURCE"
    ;;
  *)
    printf 'Preview generated (unknown format "%s") for: %s\n' "$FORMAT" "$SOURCE"
    ;;
esac
