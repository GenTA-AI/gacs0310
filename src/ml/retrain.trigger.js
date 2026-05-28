#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pythonCommand = process.env.PYTHON || 'python';
const modelDir = path.resolve('data/models/ml');
const evaluationPath = path.join(modelDir, 'candidate.evaluation.json');

function runNpmScript(scriptName) {
  execFileSync(npmCommand, ['run', scriptName], { stdio: 'inherit' });
}

function runPython(args) {
  execFileSync(pythonCommand, args, { stdio: 'inherit' });
}

function readEvaluation() {
  if (!fs.existsSync(evaluationPath)) {
    throw new Error(`Evaluation file not found: ${evaluationPath}`);
  }

  return JSON.parse(fs.readFileSync(evaluationPath, 'utf8'));
}

async function main() {
  console.log('[ml-retrain] Starting retrain pipeline');

  try {
    runNpmScript('ml:export');
    runNpmScript('ml:train');
    runNpmScript('ml:evaluate');

    const evaluation = readEvaluation();

    console.log('[ml-retrain] Evaluation result:', {
      modelVersion: evaluation.model_version,
      promotionRecommended: evaluation.promotion_recommended,
      reason: evaluation.promotion_reason,
      metrics: evaluation.candidate_metrics,
    });

    runPython(['src/ml/model_registry.py', 'promote', '--model-dir', 'data/models/ml']);

    if (evaluation.promotion_recommended) {
      console.log('[ml-retrain] Candidate promoted to latest model');
    } else {
      console.log('[ml-retrain] Candidate registered but not promoted');
    }
  } catch (err) {
    console.error('[ml-retrain] failed:', err.message);
    process.exitCode = 1;
  }
}

main();