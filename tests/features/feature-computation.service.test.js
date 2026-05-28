import { describe, expect, jest, test } from '@jest/globals';
import { FeatureComputationService } from '../../src/features/feature-computation.service.js';

describe('FeatureComputationService validation flow', () => {
  test('upserts a valid computed feature vector', async () => {
    const validator = {
      validate: jest.fn(() => ({
        valid: true,
        errors: [],
        warnings: [],
      })),
    };

    const service = new FeatureComputationService({ validator });

    service._computeFeatures = jest.fn(async () => ({
      request_count: 10,
      ranking_score: 0.8,
    }));

    service._upsert = jest.fn(async () => ({
      status: 'upserted',
      id: 1,
    }));

    const result = await service.computeForBook('book-1');

    expect(result.status).toBe('ok');
    expect(result.bookId).toBe('book-1');
    expect(result.featureCount).toBe(2);
    expect(validator.validate).toHaveBeenCalledWith({
      request_count: 10,
      ranking_score: 0.8,
    });
    expect(service._upsert).toHaveBeenCalledWith('book-1', {
      request_count: 10,
      ranking_score: 0.8,
    });
  });

  test('skips DB upsert when feature validation fails', async () => {
    const validator = {
      validate: jest.fn(() => ({
        valid: false,
        errors: ['request_count must be a finite number'],
        warnings: [],
      })),
    };

    const service = new FeatureComputationService({ validator });

    service._computeFeatures = jest.fn(async () => ({
      request_count: 'bad-value',
    }));

    service._upsert = jest.fn();

    const result = await service.computeForBook('book-1');

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('feature_validation_failed');
    expect(result.errors).toContain('request_count must be a finite number');
    expect(service._upsert).not.toHaveBeenCalled();
  });

  test('returns skipped when no source data exists', async () => {
    const validator = {
      validate: jest.fn(),
    };

    const service = new FeatureComputationService({ validator });

    service._computeFeatures = jest.fn(async () => null);
    service._upsert = jest.fn();

    const result = await service.computeForBook('unknown-book');

    expect(result).toEqual({
      status: 'skipped',
      reason: 'no_source_data',
      bookId: 'unknown-book',
    });

    expect(validator.validate).not.toHaveBeenCalled();
    expect(service._upsert).not.toHaveBeenCalled();
  });

  test('returns error_logged instead of throwing when computation fails', async () => {
    const service = new FeatureComputationService({
      validator: { validate: jest.fn() },
    });

    service._computeFeatures = jest.fn(async () => {
      throw new Error('database unavailable');
    });

    const result = await service.computeForBook('book-1');

    expect(result.status).toBe('error_logged');
    expect(result.bookId).toBe('book-1');
    expect(result.error).toBe('database unavailable');
  });
});