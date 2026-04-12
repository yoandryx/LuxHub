/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", {
      tsconfig: {
        jsx: "react-jsx",
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },
  moduleNameMapper: {
    // Handle CSS imports (with CSS modules)
    "^.+\\.module\\.(css|sass|scss)$": "identity-obj-proxy",
    // Handle CSS imports (without CSS modules)
    "^.+\\.(css|sass|scss)$": "<rootDir>/__mocks__/styleMock.js",
    // Handle image imports
    "^.+\\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$": "<rootDir>/__mocks__/fileMock.js",
    // Handle module aliases
    "^@/(.*)$": "<rootDir>/src/$1",
    // Force bson to use CJS build (avoids ESM parse errors in Jest)
    "^bson$": "<rootDir>/node_modules/bson/lib/bson.cjs",
    // Force uuid to use CJS build (jsdom resolves esm-browser which breaks Jest)
    "^uuid$": "<rootDir>/node_modules/uuid/dist/index.js",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.cjs"],
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    "<rootDir>/Solana-Anchor/",
  ],
  // Transform ESM-only Solana packages (uuid, jayson, @solana/wallet-adapter-*)
  transformIgnorePatterns: [
    "node_modules/(?!(@solana/wallet-adapter-base|@solana/wallet-adapter-react|uuid|jayson|@noble|bson|mongodb)/)",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/pages/_app.tsx",
    "!src/pages/_document.tsx",
    "!src/pages/api/**/*",
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
