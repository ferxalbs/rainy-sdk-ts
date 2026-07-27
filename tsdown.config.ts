import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  // The npm package is public, but source maps embed the original TypeScript
  // verbatim. Ship only the runtime and declarations to keep the public
  // surface intentional.
  sourcemap: false,
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
});
