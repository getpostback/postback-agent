export async function readHiddenToken(): Promise<string> {
  process.stderr.write('Paste your scoped Postback agent token: ');

  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    process.stderr.write('\n');
    return Buffer.concat(chunks).toString('utf8').trim();
  }

  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise<string>((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stderr.write('\n');
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Authentication cancelled'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value.trim());
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    process.stdin.on('data', onData);
  });
}
