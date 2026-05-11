# Smart DID Webhook Payloads (mock fixtures)

Use these payloads for local development and integration tests until sandbox access lands. The shapes match Section 3.5 of the Challenge 1 design.

All payloads share this envelope:

```json
{
  "event": "<event-name>",
  "sent_at": "<ISO 8601 UTC>",
  "idempotency_key": "<unique key per event>",
  "payload": { }
}
```

## video.requested

```json
{
  "event": "video.requested",
  "sent_at": "2026-04-01T09:32:00Z",
  "idempotency_key": "did-evt-a1b2c3d4",
  "payload": {
    "book_id": "ALPAS-00123",
    "request_count": 42,
    "ranking_score": 0.87,
    "retry_count": 3,
    "last_requested_at": "2026-04-01T09:31:55Z",
    "status": "REQUESTED",
    "expires_at": "2026-07-01T00:00:00Z"
  }
}
```

## video.status_changed

```json
{
  "event": "video.status_changed",
  "sent_at": "2026-04-01T10:00:00Z",
  "idempotency_key": "did-evt-b2c3d4e5",
  "payload": {
    "book_id": "ALPAS-00123",
    "previous_status": "REQUESTED",
    "new_status": "PROCESSING",
    "changed_at": "2026-04-01T10:00:00Z"
  }
}
```

## video.done

```json
{
  "event": "video.done",
  "sent_at": "2026-04-01T10:08:00Z",
  "idempotency_key": "did-evt-c3d4e5f6",
  "payload": {
    "book_id": "ALPAS-00123",
    "status": "DONE",
    "video_url": "https://cdn.example.com/v/curious-cat.mp4",
    "completed_at": "2026-04-01T10:08:00Z"
  }
}
```

## video.expired

```json
{
  "event": "video.expired",
  "sent_at": "2026-07-01T00:00:01Z",
  "idempotency_key": "did-evt-d4e5f6g7",
  "payload": {
    "book_id": "ALPAS-00123",
    "expired_at": "2026-07-01T00:00:00Z"
  }
}
```

## recommendation.updated

```json
{
  "event": "recommendation.updated",
  "sent_at": "2026-04-01T11:00:00Z",
  "idempotency_key": "did-evt-e5f6g7h8",
  "payload": {
    "book_id": "ALPAS-00123",
    "age_group": "8-10",
    "sort_order": 3,
    "updated_by": "librarian_session_id",
    "updated_at": "2026-04-01T10:59:44Z"
  }
}
```

## Generating signatures locally

For local HMAC testing, set `DID_WEBHOOK_SECRET=local-dev-secret-replace-me` in `.env` and compute the header as:

```
X-DID-Signature: sha256=<HMAC-SHA256(secret, raw_body)>
```

A reusable Python helper (drop into `tests/` if useful):

```python
import hmac, hashlib

def sign(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
```
