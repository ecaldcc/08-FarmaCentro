import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Screens load data in effects (fetch → setState); this React Compiler rule flags that pattern.
      'react-hooks/set-state-in-effect': 'off',
      'security/detect-object-injection': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-eval': 'error',
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
