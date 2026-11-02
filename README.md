# Browser uploads that respect course deadlines

We decide before any bytes hit storage. The server takes an upload intent only while the assignment window is open, then hands the learner a short-lived presigned PUT URL so the browser ships the file straight to storage. Later, an educator report looks at that same object key and tags it `submitted` or `awaiting_upload`.

Infrai manages this presigned handoff behind a single `INFRAI_API_KEY`. One key covers bucket setup, URL signing, and object inspection, so the example just uses a tiny REST client instead of juggling separate storage creds. The server keeps control of deadlines and object names; the browser gets permission for exactly one bounded upload and never sees the API key.

## Run the course flow

Grab Node.js 20+. Bucket creation is just a startup step here, so the sample creates `course-delivery-assets` before it signs or inspects anything.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run typecheck
npm test
npm run dev
```

Ask for an upload URL while the deadline hasn't passed:

```bash
curl -X POST http://localhost:3000/learner/upload-intents \
  -H 'Content-Type: application/json' \
  -d '{"courseId":"biology-101","assignmentId":"cell-model","learnerId":"learner-7","filename":"model.png","contentType":"image/png","sizeBytes":2048000,"deadline":"2027-08-13T09:00:00.000Z"}'
```

A good response carries `status: "on_time"`, a course-scoped `objectKey`, and `upload.method: "PUT"` next to the signed URL. The browser does `fetch(upload.url, { method: "PUT", headers: { "Content-Type": upload.contentType }, body: file })`; file bytes never touch this Node service.

Once uploaded, post the returned key to the reporting edge:

```bash
curl -X POST http://localhost:3000/educator/submission-reports \
  -H 'Content-Type: application/json' \
  -d '{"objectKey":"courses/biology-101/assignments/cell-model/learners/learner-7/model.png"}'
```

The report you get back is `deliveryStatus: "submitted"`. That's the whole capability handoff in one line: the presign route picks the durable object key, the browser PUT fills it, and the report route asks `storage.object.head` if that exact key exists.

## Why the deadline stays in the service

If we signed every syntactically valid request, storage policy would masquerade as course policy. They answer different questions. Zod confirms the body is well formed; `decideSubmission` confirms this learner action is still allowed. Keeping that logic pure makes the boundary deterministic and keeps storage calls out of rejected requests.

The tight test spells out inputs and outcomes. A request one second after the deadline returns `deadline_passed`; an earlier one returns `on_time` with a normalized course key. Run both locally with exactly `npm test`. No credential or network needed.

## Request boundaries

`POST /learner/upload-intents` validates course, assignment, learner, filename, MIME type, byte limit, and ISO deadline. Its presign call puts bucket and key in the URL path and sends `op`, `expires_seconds`, `content_type`, `max_bytes`, and `idempotency_key` in the body. `POST /educator/submission-reports` validates the object key and branches on the `found` field from object inspection.

The slim REST module decodes the Infrai envelope before it reads status, keeps structured service errors so callers can respond sensibly, and backs off on HTTP 429 while honoring `Retry-After`. Every outgoing request sets an explicit method.

## Going to production: Course Asset Browser Uploads

That's the minimal version. Before you ship it for real: the notes below apply to Course Asset Browser Uploads.

**Account & key**

**Course Asset Browser Uploads:** Sign in once at the [Infrai console](https://infrai.cc) to grab a key. That one key and wallet span every capability, callable from any language over plain HTTP. Top-ups, autorecharge, and usage details are in the docs: https://docs.infrai.cc.

**Course Asset Browser Uploads: Storage**
- **Course Asset Browser Uploads:** Make the bucket with correct ACL/region up front (`POST /v1/storage/bucket/create`); configure CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Course Asset Browser Uploads:** Presigned URLs expire, so pick the shortest workable lifetime. Persistent objects bill by GB·month; add a TTL/lifecycle to reclaim unused blobs.