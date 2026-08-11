import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

const guardPath = fileURLToPath(
  new URL('../scripts/release-guard.mjs', import.meta.url),
);

describe('npm release guard', () => {
  let projectDirectory: string;
  let packageJson: Record<string, unknown>;

  beforeEach(async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'postback-release-guard-'));
    packageJson = {
      name: '@postback/cli',
      version: '0.2.0',
      private: false,
      license: 'MIT',
      publishConfig: { access: 'public' },
      repository: {
        type: 'git',
        url: 'git+https://github.com/getpostback/postback-agent.git',
      },
    };
    await writeFile(join(projectDirectory, 'LICENSE'), 'Approved license text\n');
  });

  async function runGuard(overrides: NodeJS.ProcessEnv = {}) {
    await writeFile(
      join(projectDirectory, 'package.json'),
      JSON.stringify(packageJson),
    );
    return spawnSync(process.execPath, [guardPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        POSTBACK_RELEASE_PRERELEASE: 'false',
        POSTBACK_RELEASE_PROJECT_DIR: projectDirectory,
        POSTBACK_RELEASE_TAG: 'v0.2.0',
        ...overrides,
      },
    });
  }

  it('accepts approved public metadata whose tag matches the stable version', async () => {
    const result = await runGuard();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Release guard accepted @postback/cli@0.2.0.');
  });

  it('rejects a package that is still private', async () => {
    packageJson.private = true;
    const result = await runGuard();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Remove private:true only after release approval');
  });

  it('requires prerelease SemVer and GitHub release state to agree', async () => {
    const result = await runGuard({ POSTBACK_RELEASE_PRERELEASE: 'true' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'SemVer prerelease status must match the GitHub release type',
    );
  });
});
