#!/usr/bin/env node

require("../src/cli").main().catch((error) => {
  process.stderr.write(`[claudepet] ${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
