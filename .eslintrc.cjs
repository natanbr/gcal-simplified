module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // CLAUDE.md → TypeScript: no `x as unknown as Y`. Matches the outer assertion
    // (either `as` or `<T>` syntax) whose operand is itself an assertion to
    // unknown, any, never or object: each widens the value far enough that the
    // second assertion can reach almost any type. Proven live, on every linted
    // file, by src/__tests__/type-laundering-guard.test.ts.
    'no-restricted-syntax': [
      'error',
      {
        selector:
          ":matches(TSAsExpression, TSTypeAssertion)[expression.type=/^(TSAsExpression|TSTypeAssertion)$/][expression.typeAnnotation.type=/^(TSUnknownKeyword|TSAnyKeyword|TSNeverKeyword|TSObjectKeyword)$/]",
        message:
          '`as unknown as` (or via any, never or object) launders a type past the checker. Use a typed local, vi.mocked() or a vi.hoisted() mock; for a deliberate ill-typed input in a negative test, disable this line with a `-- reason`.',
      },
    ],
  },
}
