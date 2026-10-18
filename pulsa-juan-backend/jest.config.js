module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['dist/'],
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
  testTimeout: 30000,
};
