import { describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const python = process.env.PYTHON || 'python';

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'gacs-ml-training-'));
}

function runPython(code) {
  const result = spawnSync(python, ['-c', code], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }

  return JSON.parse(result.stdout);
}

describe('ML feature loading pipeline', () => {
  test('decodes base64 feature vectors and preserves registry feature order', async () => {
    const dir = await makeTempDir();
    const registryPath = path.join(dir, 'feature-registry.json');
    const csvPath = path.join(dir, 'training.csv');

    const featureVector = Buffer.from(JSON.stringify({
      request_count: 10,
      video_has_error: true,
      ranking_score: 0.8,
      video_status: 'pending',
    })).toString('base64');

    await fs.writeFile(registryPath, JSON.stringify({
      version: '0.1.0',
      features: [
        { feature_name: 'request_count', feature_type: 'numeric' },
        { feature_name: 'video_has_error', feature_type: 'boolean' },
        { feature_name: 'ranking_score', feature_type: 'numeric' },
        { feature_name: 'video_status', feature_type: 'categorical' },
      ],
    }));

    await fs.writeFile(
      csvPath,
      `book_id,feature_version,computed_at,feature_vector_base64,label,label_source\nbook-1,0.1.0,2026-05-27T00:00:00Z,${featureVector},0.75,generation_priority_score\n`,
    );

    const output = runPython(`
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path("src/ml").resolve()))
from feature_loader import load_training_data
x, y, names, _ = load_training_data(r"${csvPath}", r"${registryPath}")
print(json.dumps({"shape": list(x.shape), "y": y.tolist(), "names": names, "x": x.tolist()}))
`);

    expect(output.names).toEqual(['request_count', 'video_has_error', 'ranking_score']);
    expect(output.shape).toEqual([1, 3]);
    expect(output.x[0]).toEqual([10, 1, 0.8]);
    expect(output.y).toEqual([0.75]);
  });
});