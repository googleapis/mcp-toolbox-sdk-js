
import gts from 'gts';

export default [
  ...gts,
  {
    ignores: ['build/', 'package/']
  },
  {
    files: [
      '**/test/**/*.ts',
      '**/*.test.ts',
      '**/jest.globalSetup.ts',
      '**/jest.globalTeardown.ts',
      '**/jest.setup.ts'
    ],
    rules: {
      'n/no-unpublished-import': 'off',
      'n/no-extraneous-import': 'off'
    }
  }
];
