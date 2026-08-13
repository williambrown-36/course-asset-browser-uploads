export type SubmissionDecision =
  | { accepted: true; status: "on_time"; objectKey: string }
  | { accepted: false; status: "deadline_passed" };

export function decideSubmission(input: {
  courseId: string;
  assignmentId: string;
  learnerId: string;
  filename: string;
  deadline: Date;
  requestedAt: Date;
}): SubmissionDecision {
  if (input.requestedAt.getTime() > input.deadline.getTime()) {
    return { accepted: false, status: "deadline_passed" };
  }

  const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return {
    accepted: true,
    status: "on_time",
    objectKey: `courses/${input.courseId}/assignments/${input.assignmentId}/learners/${input.learnerId}/${safeFilename}`,
  };
}
