module.exports = {
  "env": {
    "browser": true,
    "es6": true,
    "node": true
  },
  "ignorePatterns": [
    "node_modules",
    "e2e",
    "generated",
    "**/__tests__/*",
    "**/__mocks__/*",
    "Dangerfile.*",
    "*.d.ts"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "tsconfig.json",
    "sourceType": "module"
  },
  "extends": [
    "@pagopa/eslint-config/strong",
  ],
  "rules": {

  }
}
