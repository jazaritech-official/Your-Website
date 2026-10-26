export default {
  testEnvironment: "node",
  transform: {},
  testMatch: ["**/__tests__/**/*.test.js"],
  collectCoverageFrom: [
    "Controllers/**/*.js",
    "utils/**/*.js",
    "!utils/debugLog.js",
    "!utils/redisClient.js",
  ],
  coverageDirectory: "coverage",
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
};
