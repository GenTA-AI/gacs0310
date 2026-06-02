export class DidApiBase {
  constructor({
    baseUrl = process.env.SMART_DID_API_BASE_URL,
    apiToken = process.env.SMART_DID_API_TOKEN,
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.DID_SYNC_REQUEST_TIMEOUT_MS || 10000),
  } = {}) {
    if (!baseUrl) throw new Error('SMART_DID_API_BASE_URL is required');
    if (typeof fetchImpl !== 'function') throw new Error('fetch is required');

    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.apiToken = apiToken;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async _get(pathname, params = {}) {
    const url = new URL(pathname, this.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value != null) url.searchParams.set(key, String(value));
    }

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

      return body;
    } finally {
      clearTimeout(timer);
    }
  }
}
