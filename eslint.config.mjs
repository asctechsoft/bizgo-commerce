import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      'source/**',
      'prisma/migrations/**',
      '**/next-env.d.ts',
      '**/*.config.{js,cjs,mjs}',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'off',
      // Business money must never use floating point helpers by accident.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='toFixed']",
          message: 'Do not use toFixed for money/quantity; use @bizgo/shared money helpers.',
        },
      ],
    },
  },
  {
    // Controllers must return DTOs, never Prisma entities (ADR-0008).
    files: ['backend/api/src/**/*.controller.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/client', '@bizgo/db'],
              message:
                'Controllers must not touch the database layer; call a service that returns a DTO (ADR-0008).',
            },
          ],
        },
      ],
    },
  },
);
