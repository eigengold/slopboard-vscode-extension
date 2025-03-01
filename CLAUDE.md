# Slopboard Tracker VS Code Extension Guide

## Build & Test Commands
- `npm run lint` - Run ESLint across all files
- `npm run test` - Run all tests (includes linting)
- `mocha ./test/specific-test.js` - Run a single test file
- `npm run pretest` - Run only linting (called by test)

## Code Style Guidelines
- **Imports**: Standard CommonJS (require/module.exports)
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Functions**: JSDoc comments for all exported functions
- **Error Handling**: Try/catch with specific error handling, log to console
- **Promises**: Use async/await for asynchronous operations
- **Formatting**: 2-space indentation, semicolons required
- **Variables**: Prefer const, use let when needed, avoid var
- **Types**: Add JSDoc type annotations for function parameters/returns
- **Privacy**: Respect user privacy - relative paths only, no personal data
- **Architecture**: Follow service-based architecture with clear separation

## Architecture Notes
Code follows a service-based pattern with extension.js as the main entry point.
Each service (API, Storage, Language) handles a specific aspect of functionality.