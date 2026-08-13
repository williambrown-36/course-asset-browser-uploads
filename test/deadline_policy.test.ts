import assert from "node:assert/strict";
import test from "node:test";
import { decideSubmission } from "../src/deadline_policy.js";

test("declines an upload intent requested after the learner deadline", () => {
  const result = decideSubmission({
    courseId: "biology-101",
    assignmentId: "cell-model",
    learnerId: "learner-7",
    filename: "model photo.png",
    deadline: new Date("2026-08-13T09:00:00.000Z"),
    requestedAt: new Date("2026-08-13T09:00:01.000Z"),
  });

  assert.deepEqual(result, { accepted: false, status: "deadline_passed" });
});

test("accepts an on-time upload and creates a course-scoped object key", () => {
  const result = decideSubmission({
    courseId: "biology-101",
    assignmentId: "cell-model",
    learnerId: "learner-7",
    filename: "model photo.png",
    deadline: new Date("2026-08-13T09:00:00.000Z"),
    requestedAt: new Date("2026-08-13T08:59:59.000Z"),
  });

  assert.deepEqual(result, {
    accepted: true,
    status: "on_time",
    objectKey: "courses/biology-101/assignments/cell-model/learners/learner-7/model_photo.png",
  });
});
