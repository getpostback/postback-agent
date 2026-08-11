import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { CLI_VERSION } from '../src/version.js';

describe('CLI release package', () => {
  it('keeps runtime and package versions aligned', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      bin?: Record<string, string>;
      files?: string[];
      license?: string;
      private?: boolean;
      publishConfig?: { access?: string; provenance?: boolean };
      scripts?: Record<string, string>;
      repository?: { type?: string; url?: string };
      version?: string;
    };

    expect(CLI_VERSION).toBe(packageJson.version);
    expect(packageJson.private).toBe(false);
    expect(packageJson.license).toBe('AGPL-3.0-only');
    expect(packageJson.publishConfig).toEqual({
      access: 'public',
      provenance: true,
    });
    expect(packageJson.bin).toEqual({ postback: 'dist/index.js' });
    expect(packageJson.files).toEqual([
      'dist',
      'LICENSE',
      'NOTICE',
      'README.md',
      'RELEASING.md',
      'SKILL.md',
    ]);
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/getpostback/postback-agent.git',
    });
    expect(packageJson.scripts?.prepublishOnly).toBe('npm run ci');
    expect(packageJson.scripts?.releaseCheck).toBeUndefined();
    expect(packageJson.scripts?.['release:check']).toContain('package:smoke');
    expect(packageJson.scripts?.['smoke:production:public']).toBeDefined();
    expect(packageJson.scripts?.['smoke:production:oauth']).toBeDefined();
    expect(packageJson.scripts?.['smoke:production:mcp']).toBeDefined();
    expect(packageJson.scripts?.['smoke:production:cli']).toBeDefined();
  });
});
