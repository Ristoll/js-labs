import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.config(...tseslint.configs.recommendedTypeChecked, {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    ignores: [
      'node_modules/**',
      'dist/**',
      'client/dist/**',
      'server/dist/**',
      'shared/dist/**',
      'coverage/**',
      '.git/**',
      'reports/**',
      'playwright-report/**',
      'test-results/**',
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  }),
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
