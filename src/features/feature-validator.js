import registry from './feature-registry.json' with { type: 'json' };

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class FeatureValidator {
  constructor(featureRegistry = registry) {
    this.registry = featureRegistry;
    this.features = featureRegistry.features || [];
    this.featureNames = new Set(this.features.map((feature) => feature.feature_name));
  }

  validate(featureVector) {
    const errors = [];
    const warnings = [];

    if (!isPlainObject(featureVector)) {
      return {
        valid: false,
        errors: ['feature_vector must be a JSON object'],
        warnings,
        featureCount: 0,
        featureVersion: this.registry.version,
      };
    }

    for (const feature of this.features) {
      const name = feature.feature_name;
      const hasValue = Object.prototype.hasOwnProperty.call(featureVector, name);
      const value = featureVector[name];

      if (!hasValue) {
        errors.push(`${name} is missing from feature_vector`);
        continue;
      }

      if (value === null || value === undefined) {
        if (feature.nullable === false) {
          errors.push(`${name} is required but is null`);
        }
        continue;
      }

      const typeError = this.#validateType(name, value, feature.feature_type);
      if (typeError) {
        errors.push(typeError);
        continue;
      }

      const rangeError = this.#validateRange(name, value, feature);
      if (rangeError) {
        errors.push(rangeError);
      }

      const enumError = this.#validateEnum(name, value, feature);
      if (enumError) {
        errors.push(enumError);
      }
    }

    for (const key of Object.keys(featureVector)) {
      if (!this.featureNames.has(key)) {
        warnings.push(`${key} is not defined in feature-registry.json`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      featureCount: Object.keys(featureVector).length,
      featureVersion: this.registry.version,
    };
  }

  #validateType(name, value, type) {
    const normalizedType = String(type || '').toLowerCase();

    if (['numeric', 'number', 'float', 'decimal'].includes(normalizedType)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `${name} must be a finite number`;
      }
      return null;
    }

    if (['integer', 'int'].includes(normalizedType)) {
      if (!Number.isInteger(value)) {
        return `${name} must be an integer`;
      }
      return null;
    }

    if (normalizedType === 'boolean') {
      if (typeof value !== 'boolean') {
        return `${name} must be a boolean`;
      }
      return null;
    }

    if (['categorical', 'string', 'enum'].includes(normalizedType)) {
      if (typeof value !== 'string') {
        return `${name} must be a string`;
      }
      return null;
    }

    if (['timestamp', 'datetime', 'date'].includes(normalizedType)) {
      const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
      if (Number.isNaN(parsed)) {
        return `${name} must be a valid date or timestamp`;
      }
      return null;
    }

    if (normalizedType === 'object') {
      if (!isPlainObject(value)) {
        return `${name} must be an object`;
      }
      return null;
    }

    if (normalizedType === 'array') {
      if (!Array.isArray(value)) {
        return `${name} must be an array`;
      }
      return null;
    }

    return null;
  }

  #validateRange(name, value, feature) {
    if (typeof value !== 'number') return null;

    const min = feature.minimum ?? feature.min ?? feature.range?.min;
    const max = feature.maximum ?? feature.max ?? feature.range?.max;

    if (min !== undefined && value < min) {
      return `${name} must be >= ${min}`;
    }

    if (max !== undefined && value > max) {
      return `${name} must be <= ${max}`;
    }

    return null;
  }

  #validateEnum(name, value, feature) {
    const allowedValues = feature.allowed_values || feature.enum || feature.categories;
    if (!Array.isArray(allowedValues) || allowedValues.length === 0) {
      return null;
    }

    if (!allowedValues.includes(value)) {
      return `${name} must be one of: ${allowedValues.join(', ')}`;
    }

    return null;
  }
}

export default FeatureValidator;