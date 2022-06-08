module.exports = {
    "testEnvironment": "node",
    "collectCoverage": false,
    "testRegex": "(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$",
    "moduleFileExtensions": [
      "js",
      "json",
      "jsx",
      "node",
      "ts",
      "tsx"
    ],
    "preset": 'jest-puppeteer',
    "transform": {
      "^.+\\.ts?$": "ts-jest"
    },
    "testMatch": null
  };