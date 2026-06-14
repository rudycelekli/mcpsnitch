const code = Number(process.argv[2] ?? 0);
process.stderr.write(`exit-code-fixture:${code}\n`);
process.exit(code);
