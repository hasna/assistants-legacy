#!/bin/bash
# Patch @opentui/core for Ink compatibility:
# 1. TextNodeRenderable.add() — skip non-string/non-renderable children (Ink accepted numbers)
# 2. TextNodeRenderable.remove() — don't throw if child not found (silently skipped adds)
# 3. TextNodeRenderable.insertBefore() — don't throw on non-text anchors/children

CORE_JS=$(find node_modules/.pnpm -path '*@opentui/core/index-7p56py22.js' 2>/dev/null | head -1)
if [ -z "$CORE_JS" ]; then
  CORE_JS=$(find node_modules/@opentui/core -name 'index-*.js' 2>/dev/null | head -1)
fi

if [ -z "$CORE_JS" ]; then
  echo "No @opentui/core JS file found — skipping patch"
  exit 0
fi

python3 -c "
import sys

with open('$CORE_JS', 'r') as f:
    content = f.read()

changed = False

# 1. Replace throw in add() with silent return
old = 'throw new Error(\"TextNodeRenderable only accepts strings, TextNodeRenderable instances, or StyledText instances\")'
new = 'if(typeof obj===\"number\"||typeof obj===\"bigint\"){obj=String(obj);if(index!==undefined){this._children.splice(index,0,obj);this.requestRender();return index}const ii=this._children.length;this._children.push(obj);this.requestRender();return ii}return-1'
if old in content:
    content = content.replace(old, new)
    changed = True

# 2. Replace throw in remove() with silent return
old2 = 'throw new Error(\"Child not found in children\")'
new2 = 'return this'
if old2 in content:
    content = content.replace(old2, new2)
    changed = True

# 3. Replace throw in insertBefore() for non-text anchors
old3 = 'throw new Error(\"Anchor must be a TextNodeRenderable\")'
new3 = 'return this'
if old3 in content:
    content = content.replace(old3, new3)
    changed = True

# 4. Replace throw in insertBefore() for non-text children
old4 = 'throw new Error(\"Child must be a string, TextNodeRenderable, or StyledText instance\")'
new4 = 'return this'
if old4 in content:
    content = content.replace(old4, new4)
    changed = True

# 5. Replace throw for anchor not found
old5 = 'throw new Error(\"Anchor node not found in children\")'
new5 = 'return this'
if old5 in content:
    content = content.replace(old5, new5)
    changed = True

if changed:
    with open('$CORE_JS', 'w') as f:
        f.write(content)
    print('Patched @opentui/core: silenced text node errors for Ink compatibility')
else:
    print('@opentui/core already patched or no matching patterns found')
"
