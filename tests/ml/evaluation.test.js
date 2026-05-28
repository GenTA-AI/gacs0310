import { describe, expect, test } from '@jest/globals';
import { spawnSync } from 'child_process';

const python = process.env.PYTHON || 'python';

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

describe('ML evaluation helpers', () => {
  test('promotion decision prefers stronger candidate models', () => {
    const output = runPython(`
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path("src/ml").resolve()))
from evaluate import should_promote

cases = {
  "no_existing": should_promote({"r2": 0.4}, None, 0.02),
  "r2_improved": should_promote({"r2": 0.55}, {"metrics": {"r2": 0.50}}, 0.02),
  "r2_not_enough": should_promote({"r2": 0.51}, {"metrics": {"r2": 0.50}}, 0.02),
  "mae_improved": should_promote({"mae": 0.10}, {"metrics": {"mae": 0.20}}, 0.02),
}
print(json.dumps(cases))
`);

    expect(output.no_existing).toEqual([true, 'no_existing_model']);
    expect(output.r2_improved).toEqual([true, 'r2_improved']);
    expect(output.r2_not_enough).toEqual([false, 'r2_not_improved_enough']);
    expect(output.mae_improved).toEqual([true, 'mae_improved']);
  });
});