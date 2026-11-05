/**
 * #8 bounded static API/DTO/TASK inventory. Does not execute application code,
 * tests, package scripts, plugins, providers, or network requests.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const UNKNOWN = Symbol('unknown');
const FASTIFY = Symbol('fastify');
const OTHER = Symbol('other');
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ALL']);
const PRIORITIES = new Set(['MUST', 'P0', 'P1', 'P2', 'OPTIONAL']);
const TASKS = [...Array.from({ length: 18 }, (_, n) => 'TASK-' + String(n).padStart(2, '0')), 'TASK-14C'];
// Contract issue provenance is pinned in source, not an obsolete progress table
// removed when STATUS became a current-state-only document.
const CONTRACT_ISSUES = [8,9,10,11,12,19,20,27,46,61,89,119,123,132,133];
const PROTECTED = new Set(['private', 'local_only', 'csv', 'forms_raw', 'private_identity_map',
  'student_records', 'real5', 'secrets', 'credentials', 'backups', 'exports', 'node_modules', 'dist']);
const ID = /^[a-z][a-z0-9-]{0,99}$/;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const scope = (parent = null) => ({ parent, values: new Map() });
function lookup(env, name) {
  for (let current = env; current; current = current.parent) if (current.values.has(name)) return current.values.get(name);
  return UNKNOWN;
}
function hasBinding(env, name) {
  for (let current = env; current; current = current.parent) if (current.values.has(name)) return true;
  return false;
}
function allowedPath(path) {
  if (typeof path !== 'string' || path.length > 512 || /[\\\0:]/.test(path)) return false;
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || PROTECTED.has(part.toLowerCase()))) return false;
  return ['Architecture.md', 'STATUS.md', 'README.md', 'CLOUD.md'].includes(path)
    || /^(?:apps\/(?:api|web)|packages\/(?:contracts|core|ai|ui)|tests|tools|infra|docs)\//.test(path)
    || /^packages\/fixtures\/(?:synthetic|negative)\//.test(path);
}
function importedPath(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  const target = posix.normalize(posix.join(posix.dirname(file), specifier)).replace(/\.js$/, '.ts');
  return allowedPath(target) ? target : null;
}

export function discoverApiRoutes(text, file) {
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const routes = [], unknown = [], calls = [], symbols = new Set(), imports = new Map(), types = new Map();
  const factoryNames = new Set(), instanceTypes = new Set(), possibleReceivers = new Set(), mapNames = new Set();
  const handled = new Set(), global = scope(), mutated = new WeakSet();
  const currentValue = (value) => value && typeof value === 'object' && mutated.has(value) ? UNKNOWN : value;
  const invalidate = (value) => { if (value && typeof value === 'object' && !value.callable) mutated.add(value); };
  let steps = 0;
  const line = (node) => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
  const note = (code, node, registrar = '<module>') => unknown.push({ code, source: file, registrar, line: line(node) });
  if (tree.parseDiagnostics.length) return { file, routes, calls, symbols: [], unknown: [{ code: 'SOURCE_PARSE_UNKNOWN', source: file }] };

  function names(node) {
    if (!node) return [];
    if (ts.isIdentifier(node)) return [node.text];
    if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) return node.elements.flatMap((item) => ts.isBindingElement(item) ? names(item.name) : []);
    return [];
  }
  function collect(node) {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && node.name) {
      for (const name of names(node.name)) symbols.add(name);
      if (node.type?.getText(tree).includes('FastifyInstance')) for (const name of names(node.name)) possibleReceivers.add(name);
      if (node.initializer && ts.isNewExpression(node.initializer)
          && ['Map', 'WeakMap', 'Set', 'WeakSet'].includes(node.initializer.expression.getText(tree))) {
        for (const name of names(node.name)) mapNames.add(name);
      }
    } else if (node.name && ts.isIdentifier(node.name) &&
      (ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)
        || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node))) symbols.add(node.name.text);
    ts.forEachChild(node, collect);
  }
  collect(tree);
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text, clause = statement.importClause;
      if (clause?.name) {
        imports.set(clause.name.text, { path: importedPath(file, specifier), symbol: 'default' });
        if (specifier === 'fastify') factoryNames.add(clause.name.text);
      }
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          const original = element.propertyName?.text ?? element.name.text;
          imports.set(element.name.text, { path: importedPath(file, specifier), symbol: original });
          if (specifier === 'fastify' && original === 'FastifyInstance') instanceTypes.add(element.name.text);
          if (specifier === 'fastify' && original === 'fastify') factoryNames.add(element.name.text);
        }
      }
    }
    if (ts.isTypeAliasDeclaration(statement)) types.set(statement.name.text, statement.type);
    if (ts.isInterfaceDeclaration(statement)) types.set(statement.name.text, statement);
  }
  instanceTypes.add('FastifyInstance');

  function typed(type, depth = 0) {
    if (!type || depth > 8) return UNKNOWN;
    if (ts.isTypeReferenceNode(type)) {
      const name = type.typeName.getText(tree);
      if (instanceTypes.has(name)) return FASTIFY;
      return types.has(name) ? typed(types.get(name), depth + 1) : UNKNOWN;
    }
    if (ts.isTypeLiteralNode(type) || ts.isInterfaceDeclaration(type)) {
      const value = Object.create(null);
      for (const member of type.members) if (ts.isPropertySignature(member) && member.name) {
        value[member.name.getText(tree).replace(/^['"]|['"]$/g, '')] = typed(member.type, depth + 1);
      }
      return value;
    }
    return UNKNOWN;
  }
  function bind(name, value, env) {
    if (ts.isIdentifier(name)) {
      env.values.set(name.text, value);
      if (value === FASTIFY) possibleReceivers.add(name.text);
    } else if (ts.isObjectBindingPattern(name)) {
      for (const item of name.elements) {
        const key = item.propertyName?.getText(tree).replace(/^['"]|['"]$/g, '') ?? item.name.getText(tree);
        bind(item.name, object(value) ? value[key] ?? UNKNOWN : UNKNOWN, env);
      }
    } else if (ts.isArrayBindingPattern(name)) {
      name.elements.forEach((item, index) => { if (ts.isBindingElement(item)) bind(item.name, Array.isArray(value) ? value[index] ?? UNKNOWN : UNKNOWN, env); });
    }
  }
  function evaluate(node, env, depth = 0) {
    if (!node || depth > 32) return UNKNOWN;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isIdentifier(node)) return currentValue(lookup(env, node.text));
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
      || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) return evaluate(node.expression, env, depth + 1);
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return { callable: node, env };
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && factoryNames.has(node.expression.text) && !hasBinding(env, node.expression.text)) return FASTIFY;
    if (ts.isNewExpression(node)) return OTHER;
    if (ts.isArrayLiteralExpression(node)) {
      if (node.elements.length > 256 || node.elements.some(ts.isSpreadElement)) return UNKNOWN;
      return node.elements.map((item) => evaluate(item, env, depth + 1));
    }
    if (ts.isObjectLiteralExpression(node)) {
      const value = Object.create(null);
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          const spread = evaluate(property.expression, env, depth + 1);
          if (!object(spread) || spread.callable) return UNKNOWN;
          Object.assign(value, spread);
        } else if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
          const key = ts.isComputedPropertyName(property.name) ? evaluate(property.name.expression, env, depth + 1)
            : property.name.getText(tree).replace(/^['"]|['"]$/g, '');
          if (typeof key !== 'string') return UNKNOWN;
          value[key] = ts.isShorthandPropertyAssignment(property) ? lookup(env, property.name.text) : evaluate(property.initializer, env, depth + 1);
        }
      }
      return value;
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const value = evaluate(node.expression, env, depth + 1);
      const key = ts.isPropertyAccessExpression(node) ? node.name.text : evaluate(node.argumentExpression, env, depth + 1);
      return object(value) && typeof key === 'string' ? currentValue(value[key] ?? UNKNOWN) : UNKNOWN;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = evaluate(node.left, env, depth + 1), right = evaluate(node.right, env, depth + 1);
      return ['string', 'number'].includes(typeof left) && ['string', 'number'].includes(typeof right) ? left + right : UNKNOWN;
    }
    if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      for (const span of node.templateSpans) {
        const part = evaluate(span.expression, env, depth + 1);
        if (!['string', 'number'].includes(typeof part)) return UNKNOWN;
        value += part + span.literal.text;
      }
      return value;
    }
    return UNKNOWN;
  }
  function member(node, env) {
    if (ts.isPropertyAccessExpression(node)) return { receiver: node.expression, method: node.name.text };
    if (ts.isElementAccessExpression(node)) return { receiver: node.expression, method: evaluate(node.argumentExpression, env) };
    return null;
  }
  function invoke(fn, arguments_, env, registrar, conditions, depth) {
    if (depth > 16) { note('CALL_DEPTH_UNKNOWN', fn.callable, registrar); return; }
    const local = scope(fn.env);
    fn.callable.parameters.forEach((parameter, index) => bind(parameter.name,
      arguments_[index] ?? typed(parameter.type), local));
    if (ts.isBlock(fn.callable.body)) block(fn.callable.body.statements, local, registrar, conditions, depth + 1);
    else expression(fn.callable.body, local, registrar, conditions, depth + 1);
  }
  function expression(node, env, registrar, conditions, depth) {
    if (!node || ++steps > 30_000) { if (node) note('ANALYSIS_BOUND_UNKNOWN', node, registrar); return; }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return;
    if (ts.isCallExpression(node)) {
      const access = member(node.expression, env);
      if (access && evaluate(access.receiver, env) === FASTIFY) {
        handled.add(node);
        const method = typeof access.method === 'string' ? access.method.toUpperCase() : '';
        if (method === 'REGISTER') { note('DYNAMIC_PLUGIN', node, registrar); return; }
        if (METHODS.has(method) || method === 'ROUTE' || !method) {
          const options = method === 'ROUTE' ? evaluate(node.arguments[0], env) : null;
          const url = method === 'ROUTE' ? options?.url ?? options?.path ?? UNKNOWN : evaluate(node.arguments[0], env);
          const rawMethods = method === 'ROUTE' ? options?.method : method;
          const methods = Array.isArray(rawMethods) ? rawMethods : [rawMethods];
          if (typeof url !== 'string' || !url.startsWith('/') || url.length > 300
            || !methods.length || methods.some((item) => typeof item !== 'string' || !METHODS.has(item.toUpperCase()))) {
            note('DYNAMIC_ROUTE', node, registrar);
          } else for (const item of methods) routes.push({
            source: file, registrar, method: item.toUpperCase(), path: url, line: line(node), conditions,
          });
          return;
        }
        // Hooks and lifecycle callbacks are intentionally not executed.
        return;
      }
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        handled.add(node);
        if (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0])) note('DYNAMIC_IMPORT', node, registrar);
        return;
      }
      if (ts.isIdentifier(node.expression)) {
        const fn = lookup(env, node.expression.text);
        const imported = hasBinding(env, node.expression.text) ? null : imports.get(node.expression.text);
        calls.push({ source: file, caller: registrar, callee: imported?.symbol ?? node.expression.text,
          target: imported?.path ?? (object(fn) && fn.callable && fn.env === global ? file : null),
          line: line(node), conditions });
        if (object(fn) && fn.callable) {
          invoke(fn, node.arguments.map((argument) => evaluate(argument, env)), env, registrar, conditions, depth);
          return;
        }
      }
      // An unknown call may mutate an aliased array/object used by a later route.
      if (access) invalidate(evaluate(access.receiver, env));
      for (const argument of node.arguments) {
        invalidate(evaluate(argument, env));
        expression(argument, env, registrar, conditions, depth);
      }
      return;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      if (ts.isIdentifier(node.left)) {
        for (let current = env; current; current = current.parent) if (current.values.has(node.left.text)) {
          current.values.set(node.left.text, UNKNOWN); break;
        }
      } else if (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left)) {
        invalidate(evaluate(node.left.expression, env));
      }
      expression(node.right, env, registrar, conditions, depth);
      return;
    }
    ts.forEachChild(node, (child) => { if (ts.isExpression(child)) expression(child, env, registrar, conditions, depth); });
  }
  function block(statements, env, registrar, conditions, depth) {
    // Lexical declarations shadow imports throughout their scope, including the TDZ.
    for (const statement of statements) if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) bind(declaration.name, UNKNOWN, env);
    }
    for (const statement of statements) if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      env.values.set(statement.name.text, { callable: statement, env });
    }
    for (const statement of statements) if (walk(statement, env, registrar, conditions, depth)) return true;
    return false;
  }
  function walk(node, env, registrar, conditions, depth) {
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isTypeAliasDeclaration(node)
      || ts.isInterfaceDeclaration(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return false;
    if (ts.isBlock(node)) return block(node.statements, scope(env), registrar, conditions, depth);
    if (ts.isVariableStatement(node)) {
      const immutable = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;
      for (const declaration of node.declarationList.declarations) {
        const value = declaration.initializer ? evaluate(declaration.initializer, env) : typed(declaration.type);
        bind(declaration.name, immutable || value === FASTIFY ? value : UNKNOWN, env);
        if (declaration.initializer) expression(declaration.initializer, env, registrar, conditions, depth);
      }
    } else if (ts.isExpressionStatement(node)) expression(node.expression, env, registrar, conditions, depth);
    else if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) {
      expression(node.expression, env, registrar, conditions, depth);
      return true;
    } else if (ts.isIfStatement(node)) {
      const condition = evaluate(node.expression, env);
      const label = node.expression.getText(tree).slice(0, 180);
      if (condition === true) return walk(node.thenStatement, scope(env), registrar, conditions, depth);
      if (condition === false) return node.elseStatement ? walk(node.elseStatement, scope(env), registrar, conditions, depth) : false;
      const left = walk(node.thenStatement, scope(env), registrar, [...conditions, label], depth);
      const right = node.elseStatement ? walk(node.elseStatement, scope(env), registrar, [...conditions, '!(' + label + ')'], depth) : false;
      return left && right;
    } else if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      const value = evaluate(node.expression, env);
      const values = ts.isForOfStatement(node) && Array.isArray(value) ? value : [UNKNOWN];
      for (const item of values) {
        const local = scope(env);
        if (ts.isVariableDeclarationList(node.initializer)) bind(node.initializer.declarations[0].name, item, local);
        walk(node.statement, local, registrar, conditions, depth);
      }
    } else if (ts.isTryStatement(node)) {
      walk(node.tryBlock, scope(env), registrar, [...conditions, 'try'], depth);
      if (node.catchClause) walk(node.catchClause.block, scope(env), registrar, [...conditions, 'catch'], depth);
      if (node.finallyBlock) walk(node.finallyBlock, scope(env), registrar, conditions, depth);
    } else if (ts.isForStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node)) {
      walk(node.statement, scope(env), registrar, [...conditions, 'loop condition unverified'], depth);
    } else if (ts.isSwitchStatement(node)) {
      for (const clause of node.caseBlock.clauses) block(clause.statements, scope(env), registrar, [...conditions, 'switch branch unverified'], depth);
    }
    return false;
  }
  block(tree.statements, global, '<module>', [], 0);
  for (const statement of tree.statements) {
    if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      invoke({ callable: statement, env: global }, statement.parameters.map((parameter) => typed(parameter.type)),
        global, statement.name.text, [], 0);
    } else if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      const fn = lookup(global, declaration.name.text);
      if (object(fn) && fn.callable) invoke(fn, fn.callable.parameters.map((parameter) => typed(parameter.type)),
        global, declaration.name.text, [], 0);
    }
  }
  function unresolved(node) {
    if (ts.isCallExpression(node) && !handled.has(node)) {
      // Inventory imports even in callbacks/helpers the registration walk never invokes.
      // Their target or reachability cannot be established by this static pass.
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword
        && (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0]))) {
        note('DYNAMIC_IMPORT', node);
        handled.add(node);
      }
      const access = member(node.expression, global);
      if (access) {
        const receiver = access.receiver.getText(tree), base = receiver.split('.')[0];
        const literalUrl = node.arguments[0] && ts.isStringLiteral(node.arguments[0]) ? node.arguments[0].text : '';
        const likely = !mapNames.has(base) && (possibleReceivers.has(base) || /\.app$/.test(receiver)
          || ['app', 'api', 'server'].includes(base) || literalUrl.startsWith('/api/'));
        const method = typeof access.method === 'string' ? access.method.toUpperCase() : '';
        if (likely && (METHODS.has(method) || ['ROUTE', 'REGISTER', ''].includes(method))) note('UNRESOLVED_REGISTRATION', node);
      }
    }
    ts.forEachChild(node, unresolved);
  }
  unresolved(tree);
  const uniqueUnknown = [...new Map(unknown.map((item) => [JSON.stringify(item), item])).values()];
  return { file, routes, calls, symbols: [...symbols].sort(), unknown: uniqueUnknown };
}

function checkedFile(root, path) {
  if (!allowedPath(path)) throw new Error('Audit input unavailable');
  let target = root;
  for (const part of path.split('/')) {
    target = join(target, part);
    if (lstatSync(target).isSymbolicLink()) throw new Error('Audit input unavailable');
  }
  const stat = lstatSync(target);
  if (!stat.isFile()) throw new Error('Audit input unavailable');
  return { target, stat };
}
function readSafe(root, path, budget, limit = 1024 * 1024) {
  const { target, stat } = checkedFile(root, path);
  if (stat.size > limit || budget.bytes + stat.size > 32 * 1024 * 1024) throw new Error('Audit input unavailable');
  const bytes = readFileSync(target);
  if (bytes.length > limit) throw new Error('Audit input unavailable');
  budget.bytes += bytes.length;
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
const routeKey = (source, registrar, method, path) => [source, registrar, method, path].join('\0');

function buildInventory(selectedRoot) {
  const root = realpathSync(selectedRoot), budget = { bytes: 0 }, cache = new Map(), facts = new Map();
  const git = (...args) => execFileSync('git', ['--no-pager', '--literal-pathspecs', '-C', root, ...args], {
    encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '', GIT_OPTIONAL_LOCKS: '0' },
  });
  if (resolve(git('rev-parse', '--show-toplevel').trim()) !== root) throw new Error('Audit input unavailable');
  const head = git('rev-parse', 'HEAD').trim();
  const candidates = new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(allowedPath));
  const read = (path) => {
    if (!cache.has(path)) cache.set(path, readSafe(root, path, budget));
    return cache.get(path);
  };
  const manifest = JSON.parse(read('tools/api_contract_inventory.json'));
  if (!object(manifest) || manifest.schemaVersion !== 1 || !object(manifest.basis)
    || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(manifest.basis.baseCommit)
    || !['minseong-hufs/HUFS-One-AI','ot4562-glitch/HUFS-One-AI'].includes(manifest.basis.repository)
    || !['canonicalIssues', 'surfaces', 'routes', 'designContracts', 'tasks'].every((key) => Array.isArray(manifest[key]))
    || manifest.routes.length > 1000 || manifest.surfaces.length > 100 || manifest.designContracts.length > 128
    || manifest.tasks.length > 100) throw new Error('Audit input unavailable');
  const findings = [], unknown = [];
  const finding = (code, id) => findings.push({ code, ...(typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id) ? { id } : {}) });
  function inspect(path) {
    if (facts.has(path)) return facts.get(path);
    try {
      const result = discoverApiRoutes(read(path), path);
      facts.set(path, result);
      return result;
    } catch {
      const result = { file: path, routes: [], calls: [], symbols: [],
        unknown: [{ code: 'SOURCE_UNAVAILABLE', source: path }] };
      facts.set(path, result);
      return result;
    }
  }
  const apiFiles = [...candidates].filter((path) => /^apps\/api\/src\/.*\.ts$/.test(path)).sort();
  if (apiFiles.length > 500) throw new Error('Audit input unavailable');
  for (const path of apiFiles) unknown.push(...inspect(path).unknown);
  function reference(ref, id) {
    const path = typeof ref === 'string' ? ref : ref?.path;
    if (!allowedPath(path)) {
      findings.push({ code: 'UNSAFE_REFERENCE', referenceHash: hash(String(path)) });
      return false;
    }
    if (!candidates.has(path)) { finding('REFERENCE_FILE_MISSING', id); return false; }
    try { checkedFile(root, path); }
    catch { finding('REFERENCE_FILE_UNAVAILABLE', id); return false; }
    if (ref?.symbol && !inspect(path).symbols.includes(ref.symbol)) { finding('REFERENCE_SYMBOL_MISSING', id); return false; }
    return true;
  }
  function references(refs, id) {
    if (!Array.isArray(refs) || refs.length > 100) { finding('INVALID_REFERENCE_LIST', id); return false; }
    return refs.map((ref) => reference(ref, id)).every(Boolean);
  }
  const status = read('STATUS.md'), architecture = read('Architecture.md');
  const issueSet = new Set(CONTRACT_ISSUES);
  if (manifest.canonicalIssues.length !== CONTRACT_ISSUES.length
    || new Set(manifest.canonicalIssues).size !== CONTRACT_ISSUES.length
    || manifest.canonicalIssues.some((number) => !issueSet.has(number)))
    finding('CANONICAL_ISSUES_MISMATCH');
  // Older fixture documents deliberately carry a canonical contract table.
  // Current STATUS has only current assigned issues; do not require its
  // deleted historical issue progress table to restore audit coverage.
  const documented = [...status.matchAll(/^\|\s*\[#(\d+)[^\]]*\]\(https:\/\/github\.com\/(?:minseong-hufs|ot4562-glitch)\/HUFS-One-AI\/issues\/\d+\)/gm)]
    .map((match) => Number(match[1]));
  if (documented.length && (documented.length !== CONTRACT_ISSUES.length
    || new Set(documented).size !== CONTRACT_ISSUES.length
    || documented.some((id) => !issueSet.has(id))))
    finding('CANONICAL_ISSUES_MISMATCH');
  function issue(value, id) { if (!Number.isSafeInteger(value) || !issueSet.has(value)) finding('NONCANONICAL_ISSUE', id); }
  const designSection = architecture.split('### A13.2')[1]?.split('### A13.3')[0] ?? '';
  const designRows = designSection.split('\n').filter((line) => /^\|\s*(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/.test(line))
    .map((line) => line.split('|')[1].trim());
  const taskSection = architecture.split('## A17.')[1]?.split('## A18.')[0] ?? '';
  const tableTasks = [...taskSection.matchAll(/^\|\s*(TASK-\d\dC?)\b/gm)].map((match) => match[1]);
  // A17 currently keeps the calendar extension as a prose entry rather
  // than a separate table row. Its explicit declaration still counts.
  const documentTasks = [...tableTasks,
    ...(!tableTasks.includes('TASK-14C') && /\bTASK-14C\b/.test(taskSection) ? ['TASK-14C'] : [])];
  if (documentTasks.length && (documentTasks.length !== TASKS.length
    || new Set(documentTasks).size!==TASKS.length
    || TASKS.some((id) => !documentTasks.includes(id)))) finding('TASK_DOCUMENT_SCOPE_MISMATCH');
  const surfaces = new Map();
  for (const surface of manifest.surfaces) {
    if (!object(surface) || !ID.test(surface.id) || surfaces.has(surface.id)) { finding('INVALID_OR_DUPLICATE_SURFACE'); continue; }
    surfaces.set(surface.id, surface);
    const validSource = reference({ path: surface.source, symbol: surface.registrar }, surface.id);
    if (!object(surface.exposure) || !['INTERNAL_COMPOSITION_ONLY', 'LOCAL_SYNTHETIC_ONLY', 'PRODUCTION_BLOCKED'].includes(surface.exposure.mode)
      || !Array.isArray(surface.exposure.conditions) || !surface.exposure.conditions.length) finding('EXPOSURE_CONDITIONS_MISSING', surface.id);
    references(surface.exposure?.refusalRefs, surface.id);
    let integrated = validSource && Array.isArray(surface.composition) && surface.composition.length > 0;
    if (!Array.isArray(surface.composition) || !surface.composition.length) finding('COMPOSITION_CALL_MISSING', surface.id);
    else for (const item of surface.composition) {
      if (!reference({ path: item.path, ...(item.caller !== '<module>' ? { symbol: item.caller } : {}) }, surface.id)) { integrated = false; continue; }
      const call = inspect(item.path).calls.some((call) => call.caller === item.caller && call.callee === surface.registrar && call.target === surface.source);
      if (!call) { finding('COMPOSITION_CALL_MISSING', surface.id); integrated = false; }
    }
    surface.integrated = integrated;
  }
  const actual = [...facts.values()].flatMap((result) => result.routes);
  const actualMap = new Map();
  for (const route of actual) {
    const key = routeKey(route.source, route.registrar, route.method, route.path);
    if (actualMap.has(key)) finding('DUPLICATE_REGISTRATION');
    actualMap.set(key, route);
  }
  const ids = new Set(), mapped = new Set(), routes = [], routeById = new Map();
  for (const item of manifest.routes) {
    if (!object(item) || !ID.test(item.id) || ids.has(item.id)) { finding('INVALID_OR_DUPLICATE_ROUTE_ID'); continue; }
    ids.add(item.id);
    if (item.status !== undefined || item.runtimeEvidence !== undefined) finding('UNSUPPORTED_RUNTIME_CLAIM', item.id);
    const surface = surfaces.get(item.surface);
    if (!surface || !allowedPath(surface.source) || !METHODS.has(item.method) || typeof item.path !== 'string' || !item.path.startsWith('/') || item.path.length > 300) {
      finding('INVALID_ROUTE_MAPPING', item.id); continue;
    }
    issue(item.primaryIssue, item.id);
    const key = routeKey(surface.source, surface.registrar, item.method, item.path);
    if (mapped.has(key)) finding('DUPLICATE_ROUTE_MAPPING', item.id);
    mapped.add(key);
    const registration = actualMap.get(key);
    const sourceUnknown = inspect(surface.source).unknown.length > 0;
    if (!registration && !sourceUnknown) finding('REGISTRATION_MISSING', item.id);
    if (!object(item.dto) || !['REFERENCES_ONLY', 'UNKNOWN'].includes(item.dto.state)) finding('INVALID_DTO_EVIDENCE', item.id);
    const dtoRefs = item.dto?.refs ?? [];
    references(dtoRefs, item.id);
    references(item.testRefs, item.id);
    references(item.consumerRefs, item.id);
    const result = {
      id: item.id, method: item.method, path: item.path, primaryIssue: item.primaryIssue,
      status: registration && surface.integrated ? 'INTEGRATED' : !registration && !sourceUnknown ? 'NOT_IMPLEMENTED' : 'UNKNOWN',
      source: surface.source, registrar: surface.registrar,
      ...(registration ? { line: registration.line, registrationConditions: registration.conditions } : {}),
      exposure: { mode: surface.exposure?.mode ?? 'UNKNOWN',
        conditions: (surface.exposure?.conditions ?? []).filter((value) => typeof value === 'string'),
        refusalRefs: (surface.exposure?.refusalRefs ?? []).filter((ref) => allowedPath(ref?.path))
          .map((ref) => ({ path: ref.path, ...(ref.symbol ? { symbol: ref.symbol } : {}) })),
      },
      dto: { state: item.dto?.state ?? 'UNKNOWN', refs: dtoRefs.filter((ref) => allowedPath(ref?.path)), shapeEvidence: 'UNKNOWN' },
      testRefs: (item.testRefs ?? []).filter(allowedPath),
      consumerRefs: (item.consumerRefs ?? []).filter(allowedPath), runtimeEvidence: 'NOT_RUN',
      consumerEvidence: item.consumerRefs?.length ? 'REFERENCES_ONLY' : 'UNKNOWN',
      ...(typeof item.notes === 'string' ? { notes: item.notes } : {}),
    };
    routes.push(result); routeById.set(item.id, result);
  }
  for (const [key, registration] of actualMap) if (!mapped.has(key)) {
    findings.push({ code: 'UNMAPPED_REGISTRATION', ...registration });
  }
  const designSeen = new Set(), designContracts = [];
  for (const item of manifest.designContracts) {
    if (!object(item) || typeof item.design !== 'string' || !Array.isArray(item.actualRouteIds)) { finding('INVALID_DESIGN_MAPPING'); continue; }
    if (designSeen.has(item.design)) finding('DUPLICATE_DESIGN_MAPPING');
    designSeen.add(item.design);
    if (designRows.length && !designRows.includes(item.design)) finding('UNRECOGNIZED_DESIGN_MAPPING');
    issue(item.primaryIssue);
    for (const id of item.actualRouteIds) if (!routeById.has(id)) finding('DESIGN_ROUTE_REFERENCE_MISSING', id);
    const linked = item.actualRouteIds.map((id) => routeById.get(id)).filter(Boolean);
    designContracts.push({ design: item.design, primaryIssue: item.primaryIssue, actualRouteIds: item.actualRouteIds,
      actualPaths: linked.map((route) => route.method + ' ' + route.path),
      status: linked.length && linked.every((route) => route.status === 'INTEGRATED') ? 'INTEGRATED'
        : unknown.length || linked.some((route) => route.status === 'UNKNOWN') ? 'UNKNOWN' : 'NOT_IMPLEMENTED',
      notes: typeof item.notes === 'string' ? item.notes : '', runtimeEvidence: 'NOT_RUN' });
  }
  if (designRows.length && designRows.some((design) => !designSeen.has(design))) finding('DESIGN_MAPPING_MISSING');
  const taskSeen = new Set(), tasks = [];
  for (const item of manifest.tasks) {
    if (!object(item) || !TASKS.includes(item.id)) { finding('UNRECOGNIZED_TASK_MAPPING'); continue; }
    if (taskSeen.has(item.id)) finding('DUPLICATE_TASK_MAPPING', item.id);
    taskSeen.add(item.id);
    if (item.status !== undefined || item.runtimeEvidence !== undefined) finding('UNSUPPORTED_RUNTIME_CLAIM', item.id);
    issue(item.primaryIssue, item.id);
    if (!Array.isArray(item.relatedIssues)) finding('NONCANONICAL_ISSUE', item.id);
    else for (const number of item.relatedIssues) issue(number, item.id);
    if (!PRIORITIES.has(item.priority)) finding('INVALID_PRIORITY', item.id);
    references(item.sourceRefs, item.id); references(item.testRefs, item.id);
    if (!Array.isArray(item.deferred)) finding('INVALID_DEFERRED_SCOPE', item.id);
    else for (const deferred of item.deferred) {
      if (!['P2', 'OPTIONAL'].includes(deferred.priority)) finding('INVALID_PRIORITY', item.id);
      issue(deferred.issue, item.id);
    }
    tasks.push({ id: item.id, primaryIssue: item.primaryIssue, relatedIssues: item.relatedIssues,
      priority: item.priority, scope: item.scope,
      sourceRefs: (item.sourceRefs ?? []).filter((ref) => allowedPath(ref?.path)),
      testRefs: (item.testRefs ?? []).filter(allowedPath), deferred: item.deferred, runtimeEvidence: 'NOT_RUN' });
  }
  if (TASKS.some((id) => !taskSeen.has(id))) finding('TASK_MAPPING_MISSING');
  return {
    schemaVersion: 1, basis: manifest.basis, currentHead: head,
    evidenceKind: 'STATIC_SOURCE_ONLY', validationStatus: findings.length ? 'FAIL' : 'PASS',
    coverage: unknown.length ? 'UNKNOWN' : 'COMPLETE_STATIC_SCOPE',
    scannedApiFiles: apiFiles.length, registrationCount: actual.length,
    sourceDigest: hash([...cache].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, text]) => path + '\0' + hash(text)).join('\n')),
    canonicalIssues: [...issueSet].sort((a, b) => a - b), routes, designContracts, tasks, findings, unknown,
    runtimeEvidence: 'NOT_RUN', releaseDecision: 'RELEASE_BLOCKED',
  };
}

export function auditApiContracts(root) {
  try { return buildInventory(root); }
  catch { throw new Error('API inventory unavailable'); }
}
export function markdownInventory(report) {
  const safe = (value) => String(value).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
  const lines = ['# API, DTO and TASK inventory', '',
    'Static validation: **' + report.validationStatus + '**; coverage: **' + report.coverage + '**.',
    'Runtime evidence: **NOT_RUN**. Release decision: **RELEASE_BLOCKED**.', '',
    '| Method | Actual route | Static status | Source | Exposure | DTO declarations (shape UNKNOWN) | Consumer references | Test evidence |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const route of report.routes) lines.push('| ' + [route.method, route.path, route.status,
    route.source + '#' + route.registrar, route.exposure?.mode, route.dto.refs.map((ref) => ref.path + (ref.symbol ? '#' + ref.symbol : '')).join(', ') || 'UNKNOWN',
    route.consumerRefs.join(', ') || 'UNKNOWN', 'NOT_RUN; ' + route.testRefs.join(', ')].map(safe).join(' | ') + ' |');
  lines.push('', '## Design path mappings', '', '| A13.2 design | Actual paths | Static status | Notes |',
    '| --- | --- | --- | --- |');
  for (const item of report.designContracts) lines.push('| ' + [item.design, item.actualPaths.join(', ') || 'None found',
    item.status, item.notes].map(safe).join(' | ') + ' |');
  lines.push('', '## TASK ownership', '', '| TASK | Priority | Primary issue | Related issues | Scope | Runtime evidence |',
    '| --- | --- | --- | --- | --- | --- |');
  for (const task of report.tasks) lines.push('| ' + [task.id, task.priority, '#' + task.primaryIssue,
    task.relatedIssues.map((id) => '#' + id).join(', '), task.scope, 'NOT_RUN'].map(safe).join(' | ') + ' |');
  lines.push('', '## Coverage observations', '',
    '| Kind | Code | Source | Line |', '| --- | --- | --- | --- |');
  for (const item of report.unknown) lines.push('| ' + ['UNKNOWN', item.code, item.source ?? '', item.line ?? ''].map(safe).join(' | ') + ' |');
  for (const item of report.findings) lines.push('| ' + ['FAIL', item.code, item.source ?? item.id ?? '', item.line ?? ''].map(safe).join(' | ') + ' |');
  lines.push('', 'Unknown observations: ' + report.unknown.length + '; validation findings: ' + report.findings.length + '.', '');
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let root = dirname(dirname(fileURLToPath(import.meta.url))), markdown = false;
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '--markdown') markdown = true;
      else if (args[index] === '--root' && args[index + 1]) root = args[++index];
      else throw new Error('API inventory unavailable');
    }
    const report = auditApiContracts(root);
    process.stdout.write(markdown ? markdownInventory(report) : JSON.stringify(report) + '\n');
    process.exitCode = report.validationStatus === 'FAIL' ? 1 : report.coverage === 'UNKNOWN' ? 3 : 0;
  } catch {
    process.stdout.write(JSON.stringify({ validationStatus: 'UNAVAILABLE', coverage: 'UNKNOWN',
      reason: 'API_INVENTORY_UNAVAILABLE', runtimeEvidence: 'NOT_RUN', releaseDecision: 'RELEASE_BLOCKED' }) + '\n');
    process.exitCode = 2;
  }
}
