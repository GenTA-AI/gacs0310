export class SmartDIDPullClient {
  constructor({
    baseUrl = process.env.SMART_DID_API_BASE_URL,
    apiToken = process.env.SMART_DID_API_TOKEN,
    scenariosPath = '/api/book-video-scenarios',
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.DID_SYNC_REQUEST_TIMEOUT_MS || 10000),
  } = {}) {
    if (!baseUrl) throw new Error('SMART_DID_API_BASE_URL is required');
    if (typeof fetchImpl !== 'function') throw new Error('fetch is required');

    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.apiToken = apiToken;
    this.scenariosPath = scenariosPath;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async fetchBookScenarios({ bookId, after, limit = 50 } = {}) {
    const url = new URL(this.scenariosPath, this.baseUrl);
    url.searchParams.set('limit', String(limit));
    if (bookId) url.searchParams.set('bookId', bookId);
    if (after) url.searchParams.set('after', new Date(after).toISOString());

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
        scenarios: body.scenarios || body.items || body.data || [],
        nextPageToken: body.nextPageToken || body.nextCursor || null,
        hasMore: Boolean(body.hasMore || body.nextPageToken || body.nextCursor),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
