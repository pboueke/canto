#!/usr/bin/env bash
# carranca shell-wrapper — wraps agent command execution and writes events to FIFO
#
# This script is the ENTRYPOINT of the agent container. It:
# 1. Waits for the FIFO to be ready (created by logger)
# 2. Starts a heartbeat background process (30s interval)
# 3. Writes agent_start event
# 4. Executes the agent command, capturing exit code
# 5. Writes agent_stop event
# 6. Exits immediately if the FIFO breaks (fail closed)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FIFO_PATH="/fifo/events"
SESSION_ID="${SESSION_ID:-unknown}"
AGENT_COMMAND="${AGENT_COMMAND:-bash}"

# --- Helpers ---

timestamp() {
  date -u +%Y-%m-%dT%H:%M:%S.%3NZ
}

ms_now() {
  date +%s%3N 2>/dev/null || date +%s
}

fail_closed() {
  local message="$1"
  echo "[carranca] $message — exiting (fail closed)" >&2
  kill 0 2>/dev/null
  exit 1
}

fifo_is_healthy() {
  [ -p "$FIFO_PATH" ] && [ -w "$FIFO_PATH" ]
}

write_event() {
  if ! fifo_is_healthy; then
    fail_closed "FIFO is unavailable"
  fi

  printf '%s\n' "$1" > "$FIFO_PATH" 2>/dev/null
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    fail_closed "FIFO write failed"
  fi
}

# shellcheck source=lib/json.sh
source "$SCRIPT_DIR/lib/json.sh"

# --- Wait for FIFO ---

WAIT_LIMIT=20
WAIT_COUNT=0
while [ ! -p "$FIFO_PATH" ]; do
  WAIT_COUNT=$((WAIT_COUNT + 1))
  if [ "$WAIT_COUNT" -ge "$WAIT_LIMIT" ]; then
    fail_closed "FIFO not found after ${WAIT_LIMIT}s"
  fi
  sleep 0.5
done

# --- Heartbeat ---

_heartbeat_loop() {
  while true; do
    sleep 30
    printf '{"type":"heartbeat","source":"shell-wrapper","ts":"%s","session_id":"%s"}\n' "$(timestamp)" "$SESSION_ID" > "$FIFO_PATH" 2>/dev/null || exit 1
  done
}

_heartbeat_loop &
HEARTBEAT_PID=$!

_fifo_watchdog_loop() {
  while true; do
    sleep 1
    fifo_is_healthy || fail_closed "FIFO disappeared"
  done
}

_fifo_watchdog_loop &
WATCHDOG_PID=$!

# --- Session start event ---

write_event "{\"type\":\"session_event\",\"source\":\"shell-wrapper\",\"event\":\"agent_start\",\"ts\":\"$(timestamp)\",\"session_id\":\"$SESSION_ID\"}"

# --- Policy hooks setup (4.3) ---

if [ "${POLICY_HOOKS:-}" = "true" ] && [ -d "/carranca-hooks" ]; then
  git config --global core.hooksPath /carranca-hooks 2>/dev/null || true
fi

# --- Execute agent command ---
# We log the overall agent command as a shell_command event.
# The agent may run sub-commands internally — those are captured by
# inotifywait (file mutations) but not individually logged as shell_command
# events in MVP (that requires execve tracing, Phase 3).

START_MS="$(ms_now)"
# AGENT_COMMAND is operator-authored (from .carranca.yml), not agent-controlled.
# eval is required to support shell syntax (pipes, &&, env vars, subshells).
# .carranca.yml is trusted operator input, hidden from the agent at runtime.
eval "$AGENT_COMMAND"
AGENT_EXIT=$?
END_MS="$(ms_now)"
DURATION=$((END_MS - START_MS))

ESCAPED_CMD="$(json_escape "$AGENT_COMMAND")"
ESCAPED_CWD="$(json_escape "$(pwd)")"
write_event "{\"type\":\"shell_command\",\"source\":\"shell-wrapper\",\"ts\":\"$(timestamp)\",\"session_id\":\"$SESSION_ID\",\"command\":\"$ESCAPED_CMD\",\"exit_code\":$AGENT_EXIT,\"duration_ms\":$DURATION,\"cwd\":\"$ESCAPED_CWD\"}"

# --- Session stop event ---

write_event "{\"type\":\"session_event\",\"source\":\"shell-wrapper\",\"event\":\"agent_stop\",\"ts\":\"$(timestamp)\",\"session_id\":\"$SESSION_ID\",\"exit_code\":$AGENT_EXIT}"

# Cleanup
kill $HEARTBEAT_PID 2>/dev/null || true
kill $WATCHDOG_PID 2>/dev/null || true
exit $AGENT_EXIT
