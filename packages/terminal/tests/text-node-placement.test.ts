import { describe, expect, test } from 'bun:test';
import ts from 'typescript';

const TEXT_NODE_TAGS = new Set(['span', 'b', 'i', 'u']);
const INLINE_HOST_TAGS = new Set(['text', 'span', 'b', 'i', 'u']);
const INLINE_PRIMITIVE_FILES = new Set([
  'packages/terminal/src/components/design-system/Badge.tsx',
  'packages/terminal/src/components/design-system/StatusIcon.tsx',
  'packages/terminal/src/components/design-system/KeyboardShortcutHint.tsx',
  'packages/terminal/src/components/prompt-input/VimStatusIndicator.tsx',
]);

function jsxTagName(name: ts.JsxTagNameExpression): string {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isJsxNamespacedName(name)) return `${name.namespace.text}:${name.name.text}`;
  return name.getText();
}

function collectInvalidTextNodes(sourceFile: ts.SourceFile): string[] {
  const problems: string[] = [];

  const visit = (node: ts.Node, hostStack: string[]) => {
    if (ts.isJsxElement(node)) {
      const tag = jsxTagName(node.openingElement.tagName);
      const nearestHost = hostStack[hostStack.length - 1];
      if (TEXT_NODE_TAGS.has(tag) && !INLINE_HOST_TAGS.has(nearestHost ?? '')) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        problems.push(`${sourceFile.fileName}:${line + 1}:${character + 1} <${tag}> inside <${nearestHost ?? 'root'}>`);
      }

      const nextStack = /^[a-z]/.test(tag) ? [...hostStack, tag] : hostStack;
      ts.forEachChild(node, (child) => visit(child, nextStack));
      return;
    }

    if (ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTagName(node.tagName);
      const nearestHost = hostStack[hostStack.length - 1];
      if (TEXT_NODE_TAGS.has(tag) && !INLINE_HOST_TAGS.has(nearestHost ?? '')) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        problems.push(`${sourceFile.fileName}:${line + 1}:${character + 1} <${tag}/> inside <${nearestHost ?? 'root'}>`);
      }
      return;
    }

    ts.forEachChild(node, (child) => visit(child, hostStack));
  };

  visit(sourceFile, []);
  return problems;
}

describe('OpenTUI text-node placement', () => {
  test('keeps span/b/i/u host nodes inside text-compatible parents', async () => {
    const glob = new Bun.Glob('packages/terminal/src/**/*.tsx');
    const problems: string[] = [];

    for await (const file of glob.scan('.')) {
      if (INLINE_PRIMITIVE_FILES.has(file)) continue;
      const source = await Bun.file(file).text();
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      problems.push(...collectInvalidTextNodes(sourceFile));
    }

    expect(problems).toEqual([]);
  });
});
