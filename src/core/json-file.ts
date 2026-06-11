import { readFileSync, writeFileSync } from 'node:fs';

interface JsonStyle {
  indent: string;
  eol: '\n' | '\r\n';
  trailingNewline: boolean;
}

function detectStyle(text: string): JsonStyle {
  const indentMatch = text.match(/^([ \t]+)"/m);
  return {
    indent: indentMatch?.[1] ?? '  ',
    eol: text.includes('\r\n') ? '\r\n' : '\n',
    trailingNewline: /\r?\n$/.test(text),
  };
}

/** Rewrite a JSON file in place, preserving indentation, key order and line endings. */
export function rewriteJson(path: string, mutate: (data: Record<string, unknown>) => void): void {
  const original = readFileSync(path, 'utf8');
  const style = detectStyle(original);
  const data = JSON.parse(original) as Record<string, unknown>;
  mutate(data);
  let text = JSON.stringify(data, null, style.indent);
  if (style.eol === '\r\n') text = text.replace(/\n/g, '\r\n');
  if (style.trailingNewline) text += style.eol;
  writeFileSync(path, text, 'utf8');
}
