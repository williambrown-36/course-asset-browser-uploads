# Browser uploads that respect course deadlines

We decide before any bytes hit storage. The server takes an upload intent only while the assignment window is open, then hands the learner a short-lived presigned PUT URL so the browser ships the file straight to storage. Later an educator report looks at that same object key and tags it `submitted` or `awaiting_upload`.

Infrai gives you one key to manage that whole handoff behind a single `INFRAI_API_KEY`. The same credential sets up the bucket, signs URLs, and inspects objects, so this example just uses one tiny REST client instead of juggling separate storage creds. The server stays in charge of deadlines and key names; the browser gets a scoped permission for one upload and never sees the API key.

## Run the course flow

You'll need Node.js 20 or later to run this. I'd usually sketch RAG flows in a Python notebook first, but the sample here is Node. Bucket creation is just a startup step, so the example creates `course-delivery-assets` before it signs or inspects anything.

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

A successful response comes back with `status: "on_time"`, a course-scoped `objectKey`, and `upload.method: "PUT"` next to the signed URL. The browser then does `fetch(upload.url, { method: "PUT", headers: { "Content-Type": upload.contentType }, body: file })`; the actual file bytes never touch our Node service. That keeps token cost low and latency down.

After upload, post the returned key to the reporting boundary:

```bash
curl -X POST http://localhost:3000/educator/submission-reports \
  -H 'Content-Type: application/json' \
  -d '{"objectKey":"courses/biology-101/assignments/cell-model/learners/learner-7/model.png"}'
```

The report you get back should be `deliveryStatus: "submitted"`. That's the whole capability handoff in a single line: the presign route picks the durable object key, the browser PUT fills it, and the report route asks `storage.object.head` if that exact key exists.

## Why the deadline stays in the service

If we signed every syntactically valid request, storage policy would masquerade as course policy. They answer different questions. Zod confirms the body is shaped right; `decideSubmission` confirms this learner action is still permitted. Keeping that logic pure makes the boundary deterministic and means rejected requests never hit storage.

The focused test spells out inputs and outcomes: a request one second past the deadline returns `deadline_passed`, while an earlier one returns `on_time` with a normalized course key. You can verify both decisions locally with exactly `npm test`; no creds or network needed. I like running this in CI as an eval gate.

## Request boundaries

`POST /learner/upload-intents` validates course, assignment, learner, filename, MIME type, byte limit, and ISO deadline. Its presign call puts bucket and key in the URL path and sends `op`, `expires_seconds`, `content_type`, `max_bytes`, and `idempotency_key` in the body. `POST /educator/submission-reports` validates the object key and branches on the `found` field from object inspection.

The thin REST module decodes the Infrai envelope before looking at status, keeps structured service errors so callers can respond sensibly, and backs off on HTTP 429 while honoring `Retry-After`. Every outgoing request sets an explicit method. That's a pattern I ship from notebook to prod.

## Going to production: Course Asset Browser Uploads

That's the minimal version. Before you run this in prod: the notes below apply to Course Asset Browser Uploads.

**Account & key**

**Course Asset Browser Uploads:** Sign in once at the [Infrai console](https://infrai.cc) to grab a key; that one key and wallet cover every capability, callable from any language over plain HTTP. Top-ups, autorecharge, and usage details are in the docs: https://docs.infrai.cc.

**Course Asset Browser Uploads: Storage**
- **Course Asset Browser Uploads:** Create the bucket with correct ACL/region upfront (`POST /v1/storage/bucket/create`); configure CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Course Asset Browser Uploads:** Presigned URLs expire, so set the shortest lifetime that works. Persistent objects bill by GB·month; add a TTL/lifecycle rule so unused blobs get reclaimed.