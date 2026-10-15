import ts from 'typescript-lsp-runtime';
import type { ArtifactFinding } from './contracts.js';

const maxText = (s: string) => s.slice(0, 220);
export function inspectJavaScript(relative: string, bytes: Uint8Array): ArtifactFinding[] {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const ext = relative.toLowerCase().split('.').pop();
  const kind = ext === 'tsx' ? ts.ScriptKind.TSX : ['ts','mts','cts'].includes(ext ?? '') ? ts.ScriptKind.TS
    : ext === 'jsx' ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
  const script = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, kind);
  const result: ArtifactFinding[] = [];
  // Only direct runtime Electron imports or immutable require bindings establish origin.
  // Ambiguous aliasing, local shadowing and reassignment produce no Electron claim.
  const electronBindings = new Set<string>();
  const electronMembers = new Map<string, string>();
  const electronNamespaces = new Set<string>();
  const shadowed = new Set<string>();
  const add = (node: ts.Node, kind: string, summary: string, status: ArtifactFinding['classification'] = 'observed') => {
    if (result.length >= 256) return;
    const pos = script.getLineAndCharacterOfPosition(node.getStart(script));
    result.push({ id: 'j' + result.length, kind, classification: status,
      summary: maxText(summary), source: relative, line: pos.line + 1, offset: node.getStart(script) });
  };
  function literal(node: ts.Node | undefined): string | undefined {
    return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
  }
  const knownElectronMembers = new Set(['BrowserWindow','contextBridge','ipcMain','ipcRenderer']);
  for (const statement of script.statements) {
    if (ts.isImportDeclaration(statement) && literal(statement.moduleSpecifier) === 'electron') {
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      if (clause.name) electronNamespaces.add(clause.name.text);
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))
        electronNamespaces.add(clause.namedBindings.name.text);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
        for (const entry of clause.namedBindings.elements)
          if (!entry.isTypeOnly && knownElectronMembers.has((entry.propertyName ?? entry.name).text)) {
            electronBindings.add(entry.name.text);
            electronMembers.set(entry.name.text, (entry.propertyName ?? entry.name).text);
          }
    }
    if (ts.isVariableStatement(statement)
      && (statement.declarationList.flags & ts.NodeFlags.Const) !== 0) {
      for (const decl of statement.declarationList.declarations) {
        const call = decl.initializer;
        if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)
          || call.expression.text !== 'require' || literal(call.arguments[0]) !== 'electron') continue;
        if (ts.isIdentifier(decl.name)) electronNamespaces.add(decl.name.text);
        if (ts.isObjectBindingPattern(decl.name)) for (const entry of decl.name.elements) {
          const member = entry.propertyName?.getText(script) ?? entry.name.getText(script);
          if (ts.isIdentifier(entry.name) && knownElectronMembers.has(member)) {
            electronBindings.add(entry.name.text);
            electronMembers.set(entry.name.text, member);
          }
        }
      }
    }
  }
  function scanShadows(node: ts.Node) {
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) shadowed.add(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.parent?.parent?.parent !== script
      && (electronBindings.has(node.name.text) || electronNamespaces.has(node.name.text)))
      shadowed.add(node.name.text);
    if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
      shadowed.add(node.left.text);
    ts.forEachChild(node, scanShadows);
  }
  scanShadows(script);
  const trusted = (name: string, names: Set<string>) => names.has(name) && !shadowed.has(name);
  function visit(node: ts.Node) {
    if (result.length >= 256) return;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
      add(node, 'module-reference', (ts.isImportDeclaration(node) ? 'import ' : 'export-from ')
        + (literal(node.moduleSpecifier) ?? 'dynamic/unknown'));
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(script);
      if (callee === 'require' || callee === 'import')
        add(node, 'module-call', callee + ' ' + (literal(node.arguments[0]) ?? 'dynamic/unknown'),
          literal(node.arguments[0]) ? 'observed' : 'unknown');
      const property = ts.isPropertyAccessExpression(node.expression) ? node.expression : undefined;
      const baseNode = property?.expression;
      const directName = baseNode && ts.isIdentifier(baseNode) ? baseNode.text : '';
      const directMember = trusted(directName, electronBindings) ? electronMembers.get(directName) : undefined;
      const nested = baseNode && ts.isPropertyAccessExpression(baseNode)
        && ts.isIdentifier(baseNode.expression)
        && trusted(baseNode.expression.text, electronNamespaces)
        ? baseNode.name.text : undefined;
      const member = directMember ?? nested;
      const operation = property?.name.text ?? '';
      if (member === 'contextBridge' && operation === 'exposeInMainWorld')
        add(node, 'electron-exposure', callee + ' ' + (literal(node.arguments[0]) ?? 'dynamic/unknown key'),
          literal(node.arguments[0]) ? 'observed' : 'unknown');
      if ((member === 'ipcMain' || member === 'ipcRenderer')
        && ['handle','on','send','invoke'].includes(operation))
        add(node, 'ipc-declaration', member + '.' + operation + ' '
          + (literal(node.arguments[0]) ?? 'dynamic/unknown channel'),
          literal(node.arguments[0]) ? 'observed' : 'unknown');
    }
    if (ts.isNewExpression(node)) {
      const expr = node.expression;
      const direct = ts.isIdentifier(expr) && trusted(expr.text, electronBindings)
        && electronMembers.get(expr.text) === 'BrowserWindow';
      const namespaced = ts.isPropertyAccessExpression(expr) && expr.name.text === 'BrowserWindow'
        && ts.isIdentifier(expr.expression) && trusted(expr.expression.text, electronNamespaces);
      if (direct || namespaced) add(node, 'window', 'Electron BrowserWindow constructor declaration');
    }
    ts.forEachChild(node, visit);
  }
  visit(script);
  const parseDiagnostics = (script as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  for (const error of parseDiagnostics) {
    if (result.length >= 256) break;
    const pos = script.getLineAndCharacterOfPosition(error.start ?? 0);
    result.push({ id: 'j' + result.length, kind: 'syntax-diagnostic', classification: 'observed',
      summary: maxText(ts.flattenDiagnosticMessageText(error.messageText, ' ')),
      source: relative, line: pos.line + 1, offset: error.start ?? 0 });
  }
  return result;
}