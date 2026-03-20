#!/bin/bash
# PostToolUse hook: runs tsc --noEmit after Write|Edit on .ts/.tsx files
FILE=$(jq -r '.tool_input.file_path // .tool_response.filePath' 2>/dev/null)
if echo "$FILE" | grep -qE '\.(ts|tsx)$'; then
  ERRORS=$(cd /home/pedro/Repositories/canto && npx tsc --noEmit 2>&1)
  RC=$?
  if [ $RC -ne 0 ]; then
    # Escape for JSON
    ESCAPED=$(echo "$ERRORS" | head -20 | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')
    echo "{\"decision\":\"block\",\"reason\":\"TypeScript errors: $ESCAPED\"}"
  fi
fi
