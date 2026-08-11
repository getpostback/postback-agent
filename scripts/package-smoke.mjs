import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(
  await readFile(join(projectRoot, 'package.json'), 'utf8'),
);
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'postback-cli-release-'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

for (const file of await readdir(join(projectRoot, 'scripts'))) {
  if (file.endsWith('.mjs')) {
    run(process.execPath, ['--check', join(projectRoot, 'scripts', file)]);
  }
}

try {
  const packed = run('npm', [
    'pack',
    '--json',
    '--pack-destination',
    temporaryDirectory,
  ]);
  const packOutput = JSON.parse(packed.stdout);
  const manifest = Array.isArray(packOutput)
    ? packOutput[0]
    : packOutput.name
      ? packOutput
      : packOutput[packageJson.name];
  assert.ok(manifest, 'npm pack did not return a package manifest');
  assert.equal(manifest.name, packageJson.name);
  assert.equal(manifest.version, packageJson.version);
  assert.deepEqual(
    manifest.files.map(({ path }) => path).sort(),
    [
      'LICENSE',
      'NOTICE',
      'README.md',
      'RELEASING.md',
      'SKILL.md',
      'dist/index.js',
      'dist/index.js.map',
      'package.json',
    ],
  );

  const consumerDirectory = join(temporaryDirectory, 'consumer');
  await mkdir(consumerDirectory);
  run('npm', [
    'install',
    '--ignore-scripts',
    '--prefix',
    consumerDirectory,
    join(temporaryDirectory, manifest.filename),
  ]);

  const executable = join(
    consumerDirectory,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'postback.cmd' : 'postback',
  );
  const version = run(executable, ['--version'], { cwd: consumerDirectory });
  assert.equal(version.stdout.trim(), packageJson.version);
  const help = run(executable, ['--help'], { cwd: consumerDirectory });
  assert.match(help.stdout, /Usage: postback/);

  process.stdout.write(
    `Installed ${packageJson.name}@${packageJson.version} and verified postback --version/--help.\n`,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
