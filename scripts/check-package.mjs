import { execFileSync } from 'node:child_process';

const output = execFileSync(
  'npm',
  ['pack', '--dry-run', '--json', '--ignore-scripts'],
  { encoding: 'utf8' },
);
const [manifest] = JSON.parse(output);

if (!manifest || !Array.isArray(manifest.files)) {
  throw new Error('npm pack did not return a package manifest.');
}

const files = manifest.files.map(({ path }) => path).sort();
const allowedFiles = new Set([
  'LICENSE',
  'README.md',
  'dist/index.cjs',
  'dist/index.d.cts',
  'dist/index.d.mts',
  'dist/index.mjs',
  'package.json',
]);
const forbiddenPatterns = [
  /\.map$/u,
  /(^|\/)\.env(?:\.|$)/u,
  /(^|\/)src\//u,
  /(^|\/)tests?\//u,
  /(^|\/)scripts?\//u,
  /(^|\/)\.github\//u,
  /(^|\/)(?:tsconfig|vitest|tsdown)\./u,
];

const unexpected = files.filter((file) => !allowedFiles.has(file));
const forbidden = files.filter((file) =>
  forbiddenPatterns.some((pattern) => pattern.test(file)),
);

if (unexpected.length > 0 || forbidden.length > 0) {
  const details = [
    unexpected.length > 0
      ? `Unexpected package files: ${unexpected.join(', ')}`
      : null,
    forbidden.length > 0
      ? `Forbidden package files: ${forbidden.join(', ')}`
      : null,
  ].filter(Boolean);
  throw new Error(details.join('\n'));
}

console.log(`Package surface verified (${files.length} files).`);
