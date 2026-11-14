#!/usr/bin/env bash
set -euo pipefail
MODE="${1:-run}"
case "$MODE" in run|--debug|--logs|--telemetry|--verify) ;; *) echo 'usage: ./script/build_and_run.sh [run|--debug|--logs|--telemetry|--verify]' >&2; exit 2;; esac
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v xcodegen >/dev/null; then echo 'XcodeGen2.46.0 is required. See docs/references/macos-setup.md.' >&2; exit 1; fi
if [[ -z "${WATCH_AGENTS_TEAM_ID:-}" ]]; then echo 'Set WATCH_AGENTS_TEAM_ID to your existing Apple development team. No account enrollment is performed.' >&2; exit 1; fi
TASK_GROUP="${WATCH_AGENTS_APP_GROUP:-${WATCH_AGENTS_TEAM_ID}.dev.watchagents}"
TASK_GUARD="$HOME/Library/Application Support/LocalStorageGuard/storage_guard.py"
if [[ -f "$TASK_GUARD" ]]; then python3 "$TASK_GUARD" preflight --need-gib 4; fi
pkill -x WatchAgentsMac >/dev/null 2>&1 || true
cd "$TASK_ROOT"
xcodegen generate --spec apps/macos/project.yml
xcodebuild -project apps/macos/WatchAgentsMac.xcodeproj -scheme WatchAgentsMac -configuration Debug -derivedDataPath "$TASK_ROOT/DerivedData/mac" DEVELOPMENT_TEAM="$WATCH_AGENTS_TEAM_ID" WATCH_AGENTS_GROUP="$TASK_GROUP" build
TASK_APP="$TASK_ROOT/DerivedData/mac/Build/Products/Debug/WatchAgentsMac.app"
case "$MODE" in
  run) /usr/bin/open -n "$TASK_APP" ;;
  --debug) lldb -- "$TASK_APP/Contents/MacOS/WatchAgentsMac" ;;
  --logs|--telemetry) /usr/bin/open -n "$TASK_APP"; /usr/bin/log stream --info --style compact --predicate 'process == "WatchAgentsMac"' ;;
  --verify) /usr/bin/open -n "$TASK_APP"; sleep 1; pgrep -x WatchAgentsMac >/dev/null ;;
esac
