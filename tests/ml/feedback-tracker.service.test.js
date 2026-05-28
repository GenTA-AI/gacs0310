import { jest, describe, expect, test, beforeEach } from '@jest/globals';

const queryMock = jest.fn();

jest.unstable_mockModule('../../src/db/client.js', () => ({
  default: {
    query: queryMock,
  },
}));

const { FeedbackTrackerService } = await import(
  '../../src/ml/feedback-tracker.service.js'
);

describe('FeedbackTrackerService', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  test('updates actual priority scores from completed video jobs', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          book_id: 'book-1',
          prediction_score: '0.75000',
          actual_priority_score: '0.82000',
        },
      ],
    });

    const service = new FeedbackTrackerService();
    const result = await service.updateActualScores();

    expect(result.status).toBe('ok');
    expect(result.updated).toBe(1);
    expect(result.rows[0].book_id).toBe('book-1');

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('SET actual_priority_score = vj.priority_score'),
    );

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('pl.prediction_score'),
    );
  });

  test('computes drift metrics using prediction_score and actual_priority_score', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          total: '10',
          mae: '0.12000',
          rmse: '0.18000',
          pearson_r: '0.81000',
        },
      ],
    });

    const service = new FeedbackTrackerService();
    const result = await service.computeDriftMetrics();

    expect(result.total).toBe('10');
    expect(result.mae).toBe('0.12000');
    expect(result.rmse).toBe('0.18000');
    expect(result.pearson_r).toBe('0.81000');

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('pl.prediction_score - pl.actual_priority_score'),
    );
  });
});