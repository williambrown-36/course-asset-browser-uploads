import { createServer, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { decideSubmission } from "./deadline_policy.js";
import { InfraiError, infrai } from "./infrai_storage.js";

const BUCKET = process.env.ASSET_BUCKET ?? "course-delivery-assets";
const PORT = Number(process.env.PORT ?? 3000);

const uploadRequest = z.object({
  courseId: z.string().min(1),
  assignmentId: z.string().min(1),
  learnerId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive().max(25_000_000),
  deadline: z.string().datetime(),
});

const reportRequest = z.object({ objectKey: z.string().min(1) });

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readBody(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

let bucketReady: Promise<unknown> | undefined;

function ensureBucket(): Promise<unknown> {
  bucketReady ??= infrai.storage.bucket.create(BUCKET);
  return bucketReady;
}

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/learner/upload-intents") {
      const input = uploadRequest.parse(await readBody(request));
      const decision = decideSubmission({
        courseId: input.courseId,
        assignmentId: input.assignmentId,
        learnerId: input.learnerId,
        filename: input.filename,
        deadline: new Date(input.deadline),
        requestedAt: new Date(),
      });
      if (!decision.accepted) return json(response, 409, decision);

      await ensureBucket();
      const signed = await infrai.storage.object.presign(BUCKET, decision.objectKey, {
        op: "put",
        expires_seconds: 600,
        content_type: input.contentType,
        max_bytes: input.sizeBytes,
        idempotency_key: randomUUID(),
      });
      return json(response, 201, {
        status: decision.status,
        objectKey: decision.objectKey,
        upload: { method: "PUT", url: signed.url, contentType: input.contentType },
      });
    }

    if (request.method === "POST" && request.url === "/educator/submission-reports") {
      const input = reportRequest.parse(await readBody(request));
      await ensureBucket();
      const object = await infrai.storage.object.head(BUCKET, input.objectKey);
      return json(response, 200, {
        objectKey: input.objectKey,
        deliveryStatus: object.found ? "submitted" : "awaiting_upload",
      });
    }

    return json(response, 404, { message: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) return json(response, 400, { message: "Invalid request", issues: error.issues });
    if (error instanceof InfraiError) return json(response, error.status, { message: error.message, detail: error.detail });
    return json(response, 500, { message: error instanceof Error ? error.message : "Unexpected error" });
  }
}).listen(PORT, () => {
  console.log(`Course asset service listening on http://localhost:${PORT}`);
});
