import js from '@eslint/js';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'backups/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      // Dangerous patterns for this project (CLAUDE.md "Seguridad web" / OWASP).
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // Too many false positives on typed object access; real injection is covered by Zod + sanitizeFilter.
      'security/detect-object-injection': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Scripts only read/write paths derived from the project folder or given by the operator.
    files: ['scripts/**/*.ts'],
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
);
