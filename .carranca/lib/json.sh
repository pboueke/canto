#!/usr/bin/env bash
# carranca/runtime/lib/json.sh — shared JSON utility functions
# Sourced by shell-wrapper.sh and any other runtime script that needs
# safe JSON string encoding.
#
# Provides:
#   json_escape "$string"        — RFC 8259 compliant string escaping
#   json_validate_line "$line"   — basic structural check (starts with {, ends with })
#
# Implementation uses pure bash/sed for portability (no jq dependency).

# Escape a string for safe embedding in a JSON value per RFC 8259.
# Handles: \ " newline carriage-return tab backspace form-feed
# and all remaining control characters U+0000–U+001F as \uXXXX.
json_escape() {
  local input="$1"
  # Phase 1: escape backslash first (must come before other escapes that
  # introduce backslashes), then double-quote, then named controls.
  local result
  result="$(printf '%s' "$input" | sed \
    -e 's/\\/\\\\/g' \
    -e 's/"/\\"/g' \
    -e 's/\x08/\\b/g' \
    -e 's/\x0c/\\f/g' \
    -e 's/\t/\\t/g')"

  # Phase 2: handle newlines and carriage returns.
  # sed operates line-by-line so we use bash parameter expansion instead.
  result="${result//$'\n'/\\n}"
  result="${result//$'\r'/\\r}"

  # Phase 3: escape remaining control characters U+0000–U+001F as \uXXXX.
  # After the above, the only remaining controls are 0x00-0x07, 0x0e-0x1f
  # (0x08=\b, 0x09=\t, 0x0a=\n, 0x0c=\f, 0x0d=\r already handled).
  local i char_val hex out=""
  for (( i=0; i<${#result}; i++ )); do
    char_val="$(printf '%d' "'${result:i:1}" 2>/dev/null || echo 0)"
    if (( char_val >= 0 && char_val <= 31 )); then
      hex="$(printf '%04x' "$char_val")"
      out+="\\u${hex}"
    else
      out+="${result:i:1}"
    fi
  done

  printf '%s' "$out"
}

# Basic structural validation: a JSON line must start with { and end with }.
# Returns 0 (true) if valid, 1 (false) otherwise.
json_validate_line() {
  local line="$1"
  # Strip leading/trailing whitespace
  local trimmed
  trimmed="$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ "$trimmed" == "{"* && "$trimmed" == *"}" ]]
}
