#!/usr/bin/env node
'use strict';

const {
  DidIncrementalSyncService,
} = require('../src/sync/did/incremental-sync.service');

async function main() {
  const service = new DidIncrementalSyncService();
  const result = await service.runOnce();

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('[did-sync] manual run failed');
  console.error(error);
  process.exitCode = 1;
});
