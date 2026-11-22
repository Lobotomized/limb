// ESLint flat config.
// Two families of rules matter most here:
//  1. Import boundaries between top-level folders (boundaries/dependencies).
//  2. Forbidden non-deterministic APIs in src/core, src/content and src/bots.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

const el = (type) => ({ element: { type } });
const elTypes = (types) => ({ element: { types } });

/** Math functions whose results can differ between JavaScript engines. Use src/core/math.ts. */
const FORBIDDEN_MATH = [
  'random', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh',
  'asinh', 'acosh', 'atanh', 'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'hypot', 'cbrt',
];

const FORBIDDEN_GLOBALS = [
  'Date', 'performance', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask', 'window', 'document', 'navigator',
  'localStorage', 'sessionStorage', 'fetch', 'WebSocket', 'RTCPeerConnection', 'AudioContext',
  'crypto', 'process', 'globalThis', 'Intl',
].map((name) => ({ name, message: `"${name}" is not allowed in deterministic code (core/content/bots).` }));

const deterministicRules = {
  'no-restricted-properties': [
    'error',
    ...FORBIDDEN_MATH.map((property) => ({
      object: 'Math',
      property,
      message: `Math.${property} is not deterministic across engines. Use src/core/math.ts or src/core/rng.ts.`,
    })),
  ],
  'no-restricted-globals': ['error', ...FORBIDDEN_GLOBALS],
  'no-restricted-syntax': [
    'error',
    { selector: "BinaryExpression[operator='**']", message: 'The ** operator is pow(); use multiplication or core/math.ts.' },
    { selector: "AssignmentExpression[operator='**=']", message: 'The **= operator is pow(); use multiplication.' },
    { selector: 'ForInStatement', message: 'for..in has engine-defined ordering semantics; iterate sorted arrays.' },
  ],
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: ['pixi.js', 'pixi.js/*'], message: 'Rendering is not allowed in deterministic code.' },
        { group: ['ws', 'electron', 'steamworks.js', 'node:*', 'fs', 'path'], message: 'Platform APIs are not allowed in deterministic code.' },
      ],
    },
  ],
};

export default tseslint.config(
  { ignores: ['dist/**', 'release/**', 'node_modules/**', 'electron/**/*.cjs', 'tests/fixtures/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { parserOptions: { ecmaVersion: 2022, sourceType: 'module' } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // ---------------------------------------------------------------- boundaries
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'tools/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { node: { extensions: ['.ts', '.js'] } },
      'boundaries/elements': [
        { type: 'schema', pattern: 'src/core/schema' },
        { type: 'core', pattern: 'src/core' },
        { type: 'content', pattern: 'src/content' },
        { type: 'registry', pattern: 'src/registry' },
        { type: 'bots', pattern: 'src/bots' },
        { type: 'input', pattern: 'src/input' },
        { type: 'net', pattern: 'src/net' },
        { type: 'render', pattern: 'src/render' },
        { type: 'ui', pattern: 'src/ui' },
        { type: 'audio', pattern: 'src/audio' },
        { type: 'platform', pattern: 'src/platform' },
        { type: 'app', pattern: 'src/app' },
        { type: 'tests', pattern: 'tests' },
        { type: 'tools', pattern: 'tools' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            // core/ imports nothing outside core/ (schema is part of core).
            { from: el('core'), allow: { to: elTypes(['core', 'schema']) } },
            { from: el('schema'), allow: { to: elTypes(['schema', 'core']) } },
            // content/ imports only TYPES from core/schema (and its own folder).
            { from: el('content'), allow: { to: el('content') } },
            { from: el('content'), allow: { to: el('schema'), dependency: { kind: 'type' } } },
            // registry/ discovers content and validates it with core.
            { from: el('registry'), allow: { to: elTypes(['core', 'schema', 'content', 'registry']) } },
            // bots read core state and content bot hints (via registry).
            { from: el('bots'), allow: { to: elTypes(['bots', 'core', 'schema', 'content', 'registry', 'input']) } },
            { from: el('input'), allow: { to: elTypes(['input', 'core', 'schema', 'platform']) } },
            // net steps/saves/restores/hashes core and carries input frames.
            { from: el('net'), allow: { to: elTypes(['net', 'core', 'schema', 'input', 'registry']) } },
            // render/ui/audio read state and events; never net/.
            { from: el('render'), allow: { to: elTypes(['render', 'core', 'schema', 'registry', 'content']) } },
            { from: el('audio'), allow: { to: elTypes(['audio', 'core', 'schema']) } },
            { from: el('ui'), allow: { to: elTypes(['ui', 'render', 'audio', 'core', 'schema', 'registry', 'input', 'platform']) } },
            // ui may name bot difficulty TYPES (menus), never run bot logic.
            { from: el('ui'), allow: { to: el('bots'), dependency: { kind: 'type' } } },
            { from: el('platform'), allow: { to: elTypes(['platform']) } },
            // the app entry wires everything together.
            { from: el('app'), allow: { to: elTypes(['app', 'core', 'schema', 'content', 'registry', 'bots', 'input', 'net', 'render', 'ui', 'audio', 'platform']) } },
            { from: elTypes(['tests', 'tools']), allow: { to: elTypes(['tests', 'tools', 'app', 'core', 'schema', 'content', 'registry', 'bots', 'input', 'net', 'render', 'ui', 'audio', 'platform']) } },
          ],
        },
      ],
    },
  },
  // ---------------------------------------------------------------- determinism
  { files: ['src/core/**/*.ts', 'src/content/**/*.ts', 'src/bots/**/*.ts'], rules: deterministicRules },
  // render/ui/audio must never import the network layer (redundant with boundaries, kept for clear messages).
  {
    files: ['src/render/**/*.ts', 'src/ui/**/*.ts', 'src/audio/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/net/*', '**/net'], message: 'render/ui/audio must not import net/.' }] }],
    },
  },
);
