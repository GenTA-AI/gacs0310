import { describe, expect, test } from '@jest/globals';
import { FeatureValidator } from '../../src/features/feature-validator.js';

const registry = {
  version: '0.1.0',
  features: [
    {
      feature_name: 'request_count',
      feature_type: 'numeric',
      nullable: false,
      minimum: 0,
    },
    {
      feature_name: 'video_has_error',
      feature_type: 'boolean',
      nullable: false,
    },
    {
      feature_name: 'video_status',
      feature_type: 'categorical',
      nullable: true,
      allowed_values: ['pending', 'active', 'completed', 'failed'],
    },
    {
      feature_name: 'last_requested_at',
      feature_type: 'timestamp',
      nullable: true,
    },
  ],
};

describe('FeatureValidator', () => {
  test('passes a valid feature vector', () => {
    const validator = new FeatureValidator(registry);

    const result = validator.validate({
      request_count: 12,
      video_has_error: false,
      video_status: 'pending',
      last_requested_at: '2026-05-26T10:00:00.000Z',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.featureVersion).toBe('0.1.0');
  });

  test('fails when a required feature is missing', () => {
    const validator = new FeatureValidator(registry);

    const result = validator.validate({
      video_has_error: false,
      video_status: 'pending',
      last_requested_at: null,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('request_count is missing from feature_vector');
  });

  test('fails when a feature has the wrong type', () => {
    const validator = new FeatureValidator(registry);

    const result = validator.validate({
      request_count: '12',
      video_has_error: false,
      video_status: 'pending',
      last_requested_at: null,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('request_count must be a finite number');
  });

  test('allows null for nullable features', () => {
    const validator = new FeatureValidator(registry);

    const result = validator.validate({
      request_count: 12,
      video_has_error: false,
      video_status: null,
      last_requested_at: null,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('fails when enum value is not allowed', () => {
    const validator = new FeatureValidator(registry);

    const result = validator.validate({
      request_count: 12,
      video_has_error: false,
      video_status: 'unknown',
      last_requested_at: null,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'video_status must be one of: pending, active, completed, failed',
    );
  });

  test('warns when unknown extra features are present', () => {
    const validator = new FeatureValidator(registry);

    const result = validator.validate({
      request_count: 12,
      video_has_error: false,
      video_status: 'pending',
      last_requested_at: null,
      extra_feature: 100,
    });

    expect(result.valid).toBe(true);
    expect(result.warnings).toContain(
      'extra_feature is not defined in feature-registry.json',
    );
  });
});