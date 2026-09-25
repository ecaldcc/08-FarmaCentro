import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'backups/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
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
    files: ['server/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Scripts only read/write paths derived from the repository root or given by the operator.
    files: ['scripts/**/*.ts'],
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Screens load data in effects (fetch → setState); this React Compiler rule flags that pattern.
      'react-hooks/set-state-in-effect': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML está prohibido (CLAUDE.md).',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'No guardes datos de sesión en el navegador (CLAUDE.md).' },
        { name: 'sessionStorage', message: 'No guardes datos de sesión en el navegador (CLAUDE.md).' },
      ],
    },
  },
);
