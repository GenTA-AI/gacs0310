#!/usr/bin/env node

import 'dotenv/config';
import { FeatureComputationService } from '../src/features/feature-computation.service.js';

async function main() {
  const service = new FeatureComputationService();
  const result = await service.computeAll();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('[feature-compute] manual run failed');
  console.error(error);
  process.exitCode = 1;
});
