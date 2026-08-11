import { afterEach, describe, expect, it, vi } from 'vitest';

import { readHiddenToken } from '../src/prompt.js';

describe('hidden token input', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads a piped token without echoing it', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(async function* (): AsyncGenerator<Buffer, undefined> {
      yield Buffer.from('  pb_agent_token_from_pipe  \n');
      return undefined;
    });

    await expect(readHiddenToken()).resolves.toBe('pb_agent_token_from_pipe');
    expect(stderr.mock.calls.map(([value]) => String(value))).toEqual([
      'Paste your scoped Postback agent token: ',
      '\n',
    ]);
  });
});
