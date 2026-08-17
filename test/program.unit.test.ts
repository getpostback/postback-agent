import { describe, expect, it } from 'vitest';

import { createProgram } from '../src/index.js';

describe('CLI command structure', () => {
  it('keeps commands split into discover, analyze, and approval-gated action groups', () => {
    const program = createProgram();
    expect(program.commands.map((command) => command.name())).toEqual([
      'auth',
      'apps',
      'diagnose',
      'analytics',
      'social',
      'integrations',
      'events',
      'installs',
      'actions',
    ]);

    const actions = program.commands.find((command) => command.name() === 'actions');
    expect(actions?.commands.map((command) => command.name())).toEqual([
      'propose',
      'list',
      'get',
      'execute',
    ]);
    const propose = actions?.commands.find((command) => command.name() === 'propose');
    expect(propose?.commands).toHaveLength(9);
    expect(propose?.commands.flatMap((command) => command.options.map((option) => option.long)))
      .not.toContain('--yes');
  });
});
