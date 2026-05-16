import { DidApiBase } from './did-api-base.js';

export class SmartDIDClient extends DidApiBase {
  constructor(options = {}) {
    super(options);
    this.recordsPath = options.recordsPath
      || process.env.SMART_DID_VIDEO_RECORDS_PATH
      || '/api/video-records';
  }

  async fetchUpdatedVideoRecords({
    updatedAfter,
    afterBookId,
    pageToken,
    limit = Number(process.env.DID_SYNC_BATCH_SIZE || 500),
  } = {}) {
    const params = { limit: String(limit) };
    if (updatedAfter) params.updatedAfter = new Date(updatedAfter).toISOString();
    if (afterBookId) params.afterBookId = afterBookId;
    if (pageToken) params.pageToken = pageToken;

    const body = await this._get(this.recordsPath, params);

    return {
      records: body.records || body.items || body.data || body.videoRecords || [],
      nextPageToken: body.nextPageToken || body.nextCursor || body.cursor || null,
      hasMore: Boolean(body.hasMore || body.nextPageToken || body.nextCursor || body.cursor),
    };
  }
}
