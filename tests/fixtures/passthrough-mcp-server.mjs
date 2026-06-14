process.stdin.setEncoding('utf8');
process.stderr.write('child-stderr-line\n');
let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  for (;;) {
    const idx = buf.indexOf('\n');
    if (idx < 0) break;
    const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        content: [{
          type: 'text',
          text: JSON.stringify({ cwd: process.cwd(), env: process.env.MCPSNITCH_TEST_ENV, argv: process.argv.slice(2) }),
        }],
      },
    }) + '\n');
  }
});
