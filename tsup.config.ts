import { defineConfig } from 'tsup';

export default defineConfig({
  // cli.js is a tiny launcher; main.js is the whole CLI, loaded after cli.js
  // turns on Node's compile cache (see src/cli.ts).
  entry: ['src/cli.ts', 'src/main.ts'],
  external: ['./main.js'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  dts: false,
  sourcemap: false,
  minify: false,
  // Ship self-contained files: resolving and loading a few hundred files from
  // node_modules was most of gitwiz's start-up time, and every command pays it.
  noExternal: [/^[^.]/],
  splitting: false,
  // Bundled CommonJS dependencies (semver, commander) still call require() for
  // Node built-ins; ESM has no require, so provide one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
  },
});
