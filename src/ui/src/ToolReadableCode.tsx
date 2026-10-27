import React from 'react';

export type CodeLanguage = 'powershell' | 'bash' | 'javascript' | 'typescript' | 'python' | 'json' | 'diff' | 'text';
export type CodePresentation = { title: string; content: string; language: CodeLanguage; proposed?: boolean };

const byExtension: Record<string, CodeLanguage> = {
  '.ps1': 'powershell', '.psm1': 'powershell', '.sh': 'bash', '.bash': 'bash',
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.jsx': 'javascript',
  '.py': 'python', '.json': 'json',
};
const asObject = (value: string): Record<string, unknown> | undefined => {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : undefined;
  } catch { return undefined; }
};
const stringValue = (v: unknown): string | undefined => typeof v === 'string' ? v : undefined;
export function shellLanguage(shell?: string): CodeLanguage {
  const value = (shell ?? '').toLowerCase();
  if (/powershell|pwsh/.test(value)) return 'powershell';
  if (/bash|zsh|sh(?:\.exe)?\b/.test(value)) return 'bash';
  return 'text';
}
export function fileLanguage(file?: string): CodeLanguage {
  const matched = file?.toLowerCase().match(/\.(psm1|ps1|bash|sh|mjs|cjs|js|jsx|tsx|ts|py|json)$/);
  return matched ? byExtension['.' + matched[1]] ?? 'text' : 'text';
}
export function requestPresentations(tool: string | undefined, raw: string, complete: boolean): CodePresentation[] {
  const obj = complete ? asObject(raw) : undefined;
  if (!obj) return [{ title: 'Captured request preview', content: raw, language: complete ? 'json' : 'text' }];
  if (tool === 'start_process' && stringValue(obj.command) !== undefined) {
    return [{ title: 'Submitted command / script', content: obj.command as string,
      language: shellLanguage(stringValue(obj.shell)) }];
  }
  if (tool === 'interact_with_process' && stringValue(obj.input) !== undefined) {
    return [{ title: 'Submitted process input', content: obj.input as string, language: 'text' }];
  }
  if (tool === 'write_file' && stringValue(obj.content) !== undefined) {
    return [{ title: 'Proposed file content · not proof of a successful write',
      content: obj.content as string, language: fileLanguage(stringValue(obj.path)), proposed: true }];
  }
  if (tool === 'edit_block' && stringValue(obj.old_string) !== undefined && stringValue(obj.new_string) !== undefined) {
    return [{
      title: 'Proposed edit diff · not proof of an applied change',
      content: [
        ...(obj.old_string as string).split('\n').map(line => '- ' + line),
        ...(obj.new_string as string).split('\n').map(line => '+ ' + line),
      ].join('\n'), language: 'diff', proposed: true,
    }];
  }
  return [{ title: 'Structured Request', content: raw, language: 'json' }];
}
const keywords: Record<CodeLanguage, RegExp> = {
  powershell: /#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\$[A-Za-z_][\w:]*|\b(?:param|function|foreach|if|else|switch|return|try|catch|finally|throw|Get-[\w-]+|Set-[\w-]+|Write-[\w-]+|Start-[\w-]+|New-[\w-]+)\b|--?[\w-]+|\b\d+\b/g,
  bash: /#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\$\{?[A-Za-z_][\w]*\}?|\b(?:if|then|fi|for|do|done|echo|export|function|case|esac|while|in)\b|--?[\w-]+|\b\d+\b/g,
  javascript: /\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|async|await|if|else|throw|import|export|from|new|true|false|null)\b|\b\d+\b/g,
  typescript: /\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|async|await|if|else|throw|import|export|from|interface|type|as|new|true|false|null)\b|\b\d+\b/g,
  python: /#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:def|class|return|if|elif|else|import|from|as|for|in|while|try|except|with|async|await|None|True|False)\b|\b\d+\b/g,
  json: /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?\b/g,
  diff: /(?!)x/g, text: /(?!)x/g,
};
function tokenClass(token: string): string {
  if (token.startsWith('#') || token.startsWith('//')) return 'syntax-comment';
  if (/^["']/.test(token)) return 'syntax-string';
  if (/^\d|^-\d/.test(token)) return 'syntax-number';
  if (token.startsWith('$') || token.startsWith('--') || /^-[a-z]/i.test(token)) return 'syntax-variable';
  return 'syntax-keyword';
}
function HighlightedLine({line, language}:{line:string;language:CodeLanguage}) {
  if (language === 'diff') return <span className={line.startsWith('+ ')?'diff-added':line.startsWith('- ')?'diff-removed':''}>{line || ' '}{'\n'}</span>;
  const regex = new RegExp(keywords[language].source, 'g');
  const output: React.ReactNode[] = [];
  let cursor = 0, tokenCount = 0;
  for (const token of line.matchAll(regex)) {
    if (tokenCount++ > 300) break;
    const index = token.index ?? 0;
    if (index > cursor) output.push(line.slice(cursor, index));
    output.push(<span className={tokenClass(token[0])} key={index}>{token[0]}</span>);
    cursor = index + token[0].length;
  }
  output.push(line.slice(cursor), '\n');
  return <span>{output}</span>;
}
export function ReadableCode({text, language, label}:{text:string;language:CodeLanguage;label?:string}) {
  return <pre className={'execution-code syntax-' + language} aria-label={label ?? 'Stored sanitized code'}>
    <code>{text.split('\n').map((line,index)=><HighlightedLine key={index} line={line} language={language}/>)}</code>
  </pre>;
}
