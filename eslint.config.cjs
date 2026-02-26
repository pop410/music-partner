module.exports = [
  {
    ignores: [
      'dist/**',
      'server-plugin/**',
      '**/*.md',
      '**/*.map',
      '**/*.LICENSE.txt',
    ],
  },
  {
    files: ['src/**/*.ts', 'webpack.config.ts', 'dump_schema.ts'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {},
  },
  {
    files: ['src/**/*.vue'],
    languageOptions: {
      parser: require('vue-eslint-parser'),
      parserOptions: {
        parser: require('@typescript-eslint/parser'),
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {},
  },
];
