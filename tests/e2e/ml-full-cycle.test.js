import { describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const python = process.env.PYTHON || 'python';
const runE2E = process.env.RUN_ML_E2E === 'true';
const maybeTest = runE2E ? test : test.skip;

describe('ML full cycle', () => {
  maybeTest('exports, trains, evaluates, and registers a candidate model', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gacs-ml-e2e-'));
    const csvPath = path.join(dir, 'training_data.csv');
    const modelDir = path.join(dir, 'models');

    let result = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'ml:export', '--', '--output', csvPath],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(0);

    const csv = await fs.readFile(csvPath, 'utf8');
    const rows = csv.trim().split('\n');

    if (rows.length <= 1) {
      console.warn('[ml-e2e] skipped remaining steps because export returned no training rows');
      return;
    }

    result = spawnSync(
      python,
      ['src/ml/train_pipeline.py', '--input', csvPath, '--output-dir', modelDir, '--model-version', 'e2e_model'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(result.status).toBe(0);

    result = spawnSync(
      python,
      ['src/ml/evaluate.py', '--input', csvPath, '--model-dir', modelDir],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(result.status).toBe(0);

    result = spawnSync(
      python,
      ['src/ml/model_registry.py', 'promote', '--model-dir', modelDir],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(result.status).toBe(0);

    expect(await fs.stat(path.join(modelDir, 'model_registry.json'))).toBeTruthy();
  });
});