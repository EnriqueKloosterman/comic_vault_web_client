// Flat config ESLint 9 (proyecto nuevo: sin shim legacy).
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { ...tsPlugin.configs.recommended.rules },
  },
];
