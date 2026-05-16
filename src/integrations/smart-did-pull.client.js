import { DidApiBase } from './did-api-base.js';

export class SmartDIDPullClient extends DidApiBase {
  constructor(options = {}) {
    super(options);
    this.scenariosPath = options.scenariosPath || '/api/book-video-scenarios';
  }

  async fetchBookScenarios({ bookId, after, limit = 50 } = {}) {
    const params = { limit: String(limit) };
    if (bookId) params.bookId = bookId;
    if (after) params.after = new Date(after).toISOString();

    const body = await this._get(this.scenariosPath, params);

    return {
      scenarios: body.scenarios || body.items || body.data || [],
      nextPageToken: body.nextPageToken || body.nextCursor || null,
      hasMore: Boolean(body.hasMore || body.nextPageToken || body.nextCursor),
    };
  }
}
