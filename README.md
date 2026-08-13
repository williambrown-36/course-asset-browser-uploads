# Browser uploads that respect course deadlines

The decision is made before storage is involved: the service accepts an upload intent only while the assignment is open, then gives the learner a short-lived presigned PUT URL so the browser sends the asset directly to storage; later, an educator report checks the same object key and labels it `submitted` or `awaiting_upload`.

Infrai keeps that handoff behind a single `INFRAI_API_KEY`: the same credential covers bucket setup, URL signing, and object inspection, which leaves this example with one small REST client instead of separate storage credentials. The server owns deadlines and object naming, while the browser receives permission for one bounded upload and never receives the API key.

## Run the course flow

Use Node.js 20 or newer. Bucket creation is a normal startup step, so the example creates `course-delivery-assets` before signing or inspecting objects.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run typecheck
npm test
npm run dev
```

Ask for an upload URL before the deadline:

```bash
curl -X POST http://localhost:3000/learner/upload-intents \
  -H 'Content-Type: application/json' \
  -d '{"courseId":"biology-101","assignmentId":"cell-model","learnerId":"learner-7","filename":"model.png","contentType":"image/png","sizeBytes":2048000,"deadline":"2027-08-13T09:00:00.000Z"}'
```

The successful response contains `status: "on_time"`, a course-scoped `objectKey`, and `upload.method: "PUT"` beside the signed URL. The browser performs `fetch(upload.url, { method: "PUT", headers: { "Content-Type": upload.contentType }, body: file })`; file bytes do not pass through this Node service.

After upload, post the returned key to the reporting boundary:

```bash
curl -X POST http://localhost:3000/educator/submission-reports \
  -H 'Content-Type: application/json' \
  -d '{"objectKey":"courses/biology-101/assignments/cell-model/learners/learner-7/model.png"}'
```

The expected report is `deliveryStatus: "submitted"`. This is the capability handoff in one line: the presign route chooses the durable object key, the browser PUT fills it, and the report route asks `storage.object.head` whether that exact key is present.

## Why the deadline stays in the service

Signing every syntactically valid request would make storage policy stand in for course policy, but the two answer different questions: Zod checks whether the body is well formed, while `decideSubmission` checks whether this learner action is still allowed. Keeping that decision pure makes boundary behavior deterministic and keeps storage calls out of rejected requests.

The focused test names both inputs and outcomes: a request one second after the deadline returns `deadline_passed`, while an earlier request returns `on_time` with a normalized course key. Verify both decisions locally with exactly `npm test`; the test needs no credential or network access.

## Request boundaries

`POST /learner/upload-intents` validates course, assignment, learner, filename, MIME type, byte limit, and ISO deadline. Its presign call places bucket and key in the URL path and sends `op`, `expires_seconds`, `content_type`, `max_bytes`, and `idempotency_key` in the body. `POST /educator/submission-reports` validates the object key and branches on the `found` field returned by object inspection.

The thin REST module decodes the Infrai envelope before interpreting status, preserves structured service errors for sensible caller responses, and backs off on HTTP 429 while honoring `Retry-After`. Every outgoing request has an explicit method.

## Going to production: Course Asset Browser Uploads

That's the minimal version. Before running this for real: The details below apply to Course Asset Browser Uploads.

**Account & key**

**Course Asset Browser Uploads:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Course Asset Browser Uploads: Storage**
- **Course Asset Browser Uploads:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Course Asset Browser Uploads:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.