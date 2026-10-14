import path from 'node:path';
import * as ts from 'typescript-lsp-runtime';

export const MCP_REGISTRATION_FILES = [
  'src/mcp/server.ts',
  'src/mcp/memory-tools.ts',
  'src/mcp/memory-experience-tools.ts',
  'src/mcp/learning-tools.ts',
  'src/mcp/partner-tools.ts',
  'src/mcp/semantic-ide-tools.ts',
  'src/mcp/skills-tools.ts',
  'src/mcp/phone-tools.ts',
  'src/mcp/phone-game-tools.ts',
  'src/mcp/code-intelligence-tools.ts',
  'src/mcp/web-research-tools.ts',
];

function canonical(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function importMap(sf, file) {
  const map = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const ns = stmt.importClause?.namedBindings;
    if (!ns || !ts.isNamespaceImport(ns)) continue;
    const raw = stmt.moduleSpecifier.text.replace(/\.js$/, '.ts');
    map.set(ns.name.text, path.posix.normalize(path.posix.join(path.posix.dirname(file), raw)));
  }
  return map;
}
function schemaRef(expr, imports) {
  let node = expr;
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'shape') node = node.expression;
  if (!ts.isPropertyAccessExpression(node) || !ts.isIdentifier(node.expression)) return null;
  const schemaFile = imports.get(node.expression.text);
  if (!schemaFile) return null;
  return { schemaFile, schemaExport: node.name.text };
}

function inputSchemaFromObject(obj) {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = prop.name.getText().replace(/^['"]|['"]$/g, '');
    if (name === 'inputSchema') return prop.initializer;
  }
  return null;
}

function deriveRegistrations(text, file) {
  if (!text) return [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = importMap(sf, file);
  const out = [];
  const visit = node => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'tool') {
        const name = node.arguments[1];
        const ref = node.arguments[3] ? schemaRef(node.arguments[3], imports) : null;
        if (name && ts.isStringLiteralLike(name) && ref) out.push({ toolName: name.text, ...ref });
      } else if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'registerTool') {
        const name = node.arguments[0];
        const config = node.arguments[1];
        const schema = config && ts.isObjectLiteralExpression(config) ? inputSchemaFromObject(config) : null;
        const ref = schema ? schemaRef(schema, imports) : null;
        if (name && ts.isStringLiteralLike(name) && ref) out.push({ toolName: name.text, ...ref });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
function objectLiteralFrom(expr) {
  if (!expr) return null;
  if (ts.isParenthesizedExpression(expr)) return objectLiteralFrom(expr.expression);
  if (!ts.isCallExpression(expr)) return null;
  if (ts.isPropertyAccessExpression(expr.expression)) {
    if (expr.expression.name.text === 'object' && expr.arguments[0] && ts.isObjectLiteralExpression(expr.arguments[0])) {
      return expr.arguments[0];
    }
    return objectLiteralFrom(expr.expression.expression);
  }
  return null;
}

function declarations(sf) {
  const map = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) map.set(decl.name.text, decl.initializer);
    }
  }
  return map;
}

function enumValues(text) {
  const match = /z\.enum\(\s*\[([^\]]*)\]/.exec(text);
  if (!match) return [];
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(item => item[1]).sort();
}
function schemaContract(text, file, exportName) {
  if (!text) return null;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const defs = declarations(sf);
  const init = defs.get(exportName);
  const object = objectLiteralFrom(init);
  if (!object) return { properties: {}, required: [], opaque: canonical(init?.getText(sf) ?? '') };
  const properties = {};
  const required = [];
  for (const prop of object.properties) {
    if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
    const name = prop.name.getText(sf).replace(/^['"]|['"]$/g, '');
    let expression = ts.isPropertyAssignment(prop) ? prop.initializer.getText(sf) : prop.name.getText(sf);
    if (ts.isShorthandPropertyAssignment(prop)) {
      const dep = defs.get(prop.name.text);
      if (dep) expression += `=>${dep.getText(sf)}`;
    }
    const normalized = canonical(expression);
    const optional = /\.optional\s*\(/.test(normalized) || /\.default\s*\(/.test(normalized);
    const kind = ['string', 'number', 'boolean', 'enum', 'array', 'object', 'record', 'union', 'literal', 'any', 'unknown']
      .find(type => normalized.includes(`z.${type}(`)) ?? 'other';
    const enums = enumValues(normalized);
    properties[name] = { expression: normalized, optional, kind, enumValues: enums };
    if (!optional) required.push(name);
  }
  return { properties, required: required.sort(), opaque: null };
}
async function contracts(read) {
  const registrations = [];
  for (const file of MCP_REGISTRATION_FILES) registrations.push(...deriveRegistrations(await read(file), file));
  const result = {};
  for (const registration of registrations) {
    const text = await read(registration.schemaFile);
    result[registration.toolName] = {
      schemaFile: registration.schemaFile,
      schemaExport: registration.schemaExport,
      contract: schemaContract(text, registration.schemaFile, registration.schemaExport),
    };
  }
  return result;
}

function setDiff(left, right) {
  const other = new Set(right);
  return left.filter(value => !other.has(value));
}

export async function compareMcpContracts(currentRead, baselineRead) {
  const [current, baseline] = await Promise.all([contracts(currentRead), contracts(baselineRead)]);
  const removedTools = setDiff(Object.keys(baseline), Object.keys(current)).sort();
  const addedTools = setDiff(Object.keys(current), Object.keys(baseline)).sort();
  const toolChanges = [];
  let breaking = removedTools.length > 0;
  for (const name of Object.keys(current).filter(name => baseline[name]).sort()) {
    const before = baseline[name].contract ?? { properties: {}, required: [] };
    const after = current[name].contract ?? { properties: {}, required: [] };
    const removedParams = setDiff(Object.keys(before.properties ?? {}), Object.keys(after.properties ?? {})).sort();
    const addedParams = setDiff(Object.keys(after.properties ?? {}), Object.keys(before.properties ?? {})).sort();
    const newlyRequired = setDiff(after.required ?? [], before.required ?? []).sort();
    const changedParams = [];
    for (const param of Object.keys(after.properties ?? {}).filter(param => before.properties?.[param]).sort()) {
      const a = after.properties[param];
      const b = before.properties[param];
      const enumNarrowed = setDiff(b.enumValues ?? [], a.enumValues ?? []).length > 0;
      const typeChanged = a.kind !== b.kind;
      if (a.expression !== b.expression) changedParams.push({ param, typeChanged, enumNarrowed });
      if (typeChanged || enumNarrowed) breaking = true;
    }
    if (removedParams.length || newlyRequired.length) breaking = true;
    if (removedParams.length || addedParams.length || newlyRequired.length || changedParams.length) {
      toolChanges.push({ name, removedParams, addedParams, newlyRequired, changedParams });
    }
  }
  return { removedTools, addedTools, toolChanges, breakingEvidence: breaking, currentCount: Object.keys(current).length, baselineCount: Object.keys(baseline).length };
}
