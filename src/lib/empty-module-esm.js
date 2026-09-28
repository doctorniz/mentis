// ESM empty module for aliases whose target is actually loaded at runtime.
// (empty-module.js is CommonJS; Vite only converts CommonJS inside
// node_modules, so that one must only stand in for code that never executes.)
export default {}
