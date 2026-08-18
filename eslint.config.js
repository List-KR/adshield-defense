export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'comma-dangle': ['error', 'always-multiline'],
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': 'error',
      quotes: ['error', 'single', { allowTemplateLiterals: true }],
      semi: ['error', 'always'],
    },
  },
];
