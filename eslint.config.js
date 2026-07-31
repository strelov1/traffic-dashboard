import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  {
    // perf/ holds k6 scripts: they run in k6's own runtime, importing modules
    // that do not exist in node_modules, so type-aware linting has no project
    // to resolve them against.
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'perf/**'],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Type aliases over interfaces: no implicit declaration merging.
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    },
  },
  {
    files: ['api/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
)
