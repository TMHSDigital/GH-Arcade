import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '.vite/', '.claude-reports/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // tsc already reports unused locals and parameters; allow the leading-underscore convention here too.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Non-null assertions are used deliberately for DOM lookups and scene fields set in create().
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // Node scripts and config files.
    files: ['scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
);
