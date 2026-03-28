#!/bin/bash
# Patch @opentui/core to accept non-string children in TextNodeRenderable.
# OpenTUI throws on numbers/objects as text children; Ink/React allow them.
# This replaces the throw with a silent return -1.

CORE_JS=$(find node_modules/.pnpm -path '*@opentui/core/index-7p56py22.js' 2>/dev/null | head -1)
if [ -z "$CORE_JS" ]; then
  # Try alternate location
  CORE_JS=$(find node_modules/@opentui/core -name 'index-*.js' 2>/dev/null | head -1)
fi

if [ -n "$CORE_JS" ] && grep -q 'TextNodeRenderable only accepts strings' "$CORE_JS" 2>/dev/null; then
  sed -i.bak 's/throw new Error("TextNodeRenderable only accepts strings, TextNodeRenderable instances, or StyledText instances")/return-1/' "$CORE_JS"
  rm -f "${CORE_JS}.bak"
  echo "Patched @opentui/core: TextNodeRenderable.add() now silently skips non-string children"
fi
