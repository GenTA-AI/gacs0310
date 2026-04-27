'use strict';

class SmartDIDClient {
  constructor({
    baseUrl = process.env.SMART_DID_API_BASE_URL,
    apiToken = process.env.SMART_DID_API_TOKEN,
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.DID_SYNC_REQUEST_TIMEOUT_MS || 10000),
  } = {}) {
    if (!baseUrl) throw new Error('SMART_DID_API_BASE_URL is required');

    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.apiToken = apiToken;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async fetchUpdatedVideoRecords({
    updatedAfter,
    afterBookId,
    pageToken,
    limit = Number(process.env.DID_SYNC_BATCH_SIZE || 500),
  } = {}) {
    const url = new URL('/api/video-records', this.baseUrl);
    url.searchParams.set('limit', String(limit));

    if (updatedAfter) {
      url.searchParams.set('updatedAfter', new Date(updatedAfter).toISOString());
    }

    if (afterBookId) url.searchParams.set('afterBookId', afterBookId);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {}),
        },
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(`Smart DID API failed with status ${response.status}`);
      }

      return {
        records: body.records || body.items || body.data || [],
        nextPageToken: body.nextPageToken || body.nextCursor || null,
        hasMore: Boolean(body.hasMore || body.nextPageToken || body.nextCursor),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { SmartDIDClient };
