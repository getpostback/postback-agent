import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = process.env.POSTBACK_RELEASE_PROJECT_DIR
  ?? fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(
  await readFile(join(projectRoot, 'package.json'), 'utf8'),
);
const releaseTag = process.env.POSTBACK_RELEASE_TAG;
const releaseIsPrerelease = process.env.POSTBACK_RELEASE_PRERELEASE === 'true';

assert.equal(packageJson.name, '@postback/cli', 'Unexpected npm package name');
assert.equal(packageJson.private, false, 'Remove private:true only after release approval');
assert.equal(
  packageJson.repository?.url,
  'git+https://github.com/getpostback/postback-agent.git',
  'Repository metadata must match the trusted publisher repository',
);
assert.equal(
  packageJson.publishConfig?.access,
  'public',
  'Scoped packages must explicitly publish with public access',
);
assert.ok(
  typeof packageJson.license === 'string'
    && packageJson.license.trim() !== ''
    && packageJson.license !== 'UNLICENSED',
  'An approved SPDX license is required before publication',
);
await access(join(projectRoot, 'LICENSE'));
assert.equal(releaseTag, `v${packageJson.version}`, 'Release tag must match package version');
assert.equal(
  packageJson.version.includes('-'),
  releaseIsPrerelease,
  'SemVer prerelease status must match the GitHub release type',
);

process.stdout.write(
  `Release guard accepted ${packageJson.name}@${packageJson.version}.\n`,
);
