#!/usr/bin/env node

import 'dotenv/config';
import { execSync } from 'child_process';

async function main() {
  console.log('[ml-retrain] Starting retrain pipeline...');

  try {
    execSync('npm run ml:export', { stdio: 'inherit' });
  } catch (err) {
    console.error('[ml-retrain] Export failed, aborting');
    process.exitCode = 1;
    return;
  }

  console.log('[ml-retrain] Training data exported, launching Python pipeline...');

  try {
    execSync('npm run ml:train', { stdio: 'inherit' });
  } catch (err) {
    console.error('[ml-retrain] Training failed');
    process.exitCode = 1;
    return;
  }

  console.log('[ml-retrain] Evaluating new model against baseline...');

  try {
    execSync('npm run ml:evaluate', { stdio: 'inherit' });
  } catch (err) {
    console.error('[ml-retrain] Evaluation failed (non-fatal)');
  }

  console.log('[ml-retrain] Pipeline complete.');
}

main().catch((error) => {
  console.error('[ml-retrain] unexpected error:', error.message);
  process.exitCode = 1;
});
