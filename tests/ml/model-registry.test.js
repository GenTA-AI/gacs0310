import { describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const python = process.env.PYTHON || 'python';

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'gacs-model-registry-'));
}

describe('model_registry.py', () => {
  test('promotes a recommended candidate and writes latest artifacts', async () => {
    const dir = await makeTempDir();

    await fs.writeFile(path.join(dir, 'candidate.onnx'), 'onnx');
    await fs.writeFile(path.join(dir, 'candidate.joblib'), 'joblib');
    await fs.writeFile(path.join(dir, 'candidate.features.json'), JSON.stringify(['request_count']));
    await fs.writeFile(path.join(dir, 'candidate.metadata.json'), JSON.stringify({
      model_version: 'test_model_v1',
      metrics: { r2: 0.75 },
      onnx_path: path.join(dir, 'candidate.onnx'),
    }));
    await fs.writeFile(path.join(dir, 'candidate.evaluation.json'), JSON.stringify({
      model_version: 'test_model_v1',
      promotion_recommended: true,
      candidate_metrics: { r2: 0.75 },
    }));

    const result = spawnSync(
      python,
      ['src/ml/model_registry.py', 'promote', '--model-dir', dir],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(0);

    const registry = JSON.parse(await fs.readFile(path.join(dir, 'model_registry.json'), 'utf8'));

    expect(registry.latest_model_version).toBe('test_model_v1');
    expect(registry.models).toHaveLength(1);
    expect(await fs.readFile(path.join(dir, 'latest.onnx'), 'utf8')).toBe('onnx');
    expect(await fs.readFile(path.join(dir, 'latest.features.json'), 'utf8')).toContain('request_count');
  });
});