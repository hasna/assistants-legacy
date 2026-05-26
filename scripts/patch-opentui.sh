#!/bin/bash
# Patch @opentui/core for Ink compatibility:
# 1. TextNodeRenderable.add() — coerce numbers/bigints to string (Ink accepted numbers)
# 2. TextNodeRenderable.remove() — don't throw if child not found (silently skipped adds)
# 3. TextNodeRenderable.insertBefore() — don't throw on non-text anchors/children
#
# Patches EVERY @opentui/core copy found under node_modules, including bun's isolated
# `.bun` store, pnpm's `.pnpm` store, flat installs, and global installs. The bundler
# may resolve a different core version than the one hoisted, so we patch them all.
# The patch is idempotent — running it repeatedly is safe.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

# Collect every @opentui/core index-*.js across all candidate roots. -L follows the
# symlinks bun creates from node_modules/@opentui/core into the .bun store.
declare -A SEEN
CORE_FILES=()
for ROOT in \
  "${PACKAGE_DIR}/node_modules" \
  "node_modules" \
  "$(dirname "$(dirname "$PACKAGE_DIR")")"; do
  [ -d "$ROOT" ] || continue
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    real="$(readlink -f "$f" 2>/dev/null || echo "$f")"
    if [ -z "${SEEN[$real]:-}" ]; then
      SEEN[$real]=1
      CORE_FILES+=("$real")
    fi
  done < <(find -L "$ROOT" -path '*@opentui/core/index-*.js' -type f 2>/dev/null)
done

if [ ${#CORE_FILES[@]} -eq 0 ]; then
  echo "No @opentui/core JS file found — skipping patch"
  exit 0
fi

for CORE_JS in "${CORE_FILES[@]}"; do
  echo "Patching: $CORE_JS"
  CORE_JS="$CORE_JS" python3 -c "
import os
core = os.environ['CORE_JS']
with open(core, 'r') as f:
    content = f.read()

changed = False
replacements = [
    # add(): coerce numbers/bigints to string instead of throwing
    ('throw new Error(\"TextNodeRenderable only accepts strings, TextNodeRenderable instances, or StyledText instances\")',
     'if(typeof obj===\"number\"||typeof obj===\"bigint\"){obj=String(obj);if(index!==undefined){this._children.splice(index,0,obj);this.requestRender();return index}const ii=this._children.length;this._children.push(obj);this.requestRender();return ii}return-1'),
    # remove(): silently ignore missing child
    ('throw new Error(\"Child not found in children\")', 'return this'),
    # insertBefore(): tolerate non-text anchors/children
    ('throw new Error(\"Anchor must be a TextNodeRenderable\")', 'return this'),
    ('throw new Error(\"Child must be a string, TextNodeRenderable, or StyledText instance\")', 'return this'),
    ('throw new Error(\"Anchor node not found in children\")', 'return this'),
]
for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        changed = True

if changed:
    with open(core, 'w') as f:
        f.write(content)
    print('  patched')
else:
    print('  already patched / no matching patterns')
"
done
