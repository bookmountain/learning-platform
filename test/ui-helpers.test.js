import assert from "node:assert/strict";
import test from "node:test";

import { applyLessonCompletion } from "../public/progress.js";
import { formatDuration, formatTime } from "../public/time.js";

test("formatTime renders transcript-style timestamps", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(65.9), "1:05");
  assert.equal(formatTime(3661), "1:01:01");
});

test("formatDuration hides missing durations and formats known durations", () => {
  assert.equal(formatDuration(null), "");
  assert.equal(formatDuration(Number.NaN), "");
  assert.equal(formatDuration(0), "");
  assert.equal(formatDuration(185), "3:05");
});

test("applyLessonCompletion only mutates when the completion state changes", () => {
  const completed = { lessonA: true };

  assert.equal(applyLessonCompletion(completed, "lessonA", true), false);
  assert.deepEqual(completed, { lessonA: true });

  assert.equal(applyLessonCompletion(completed, "lessonB", true), true);
  assert.deepEqual(completed, { lessonA: true, lessonB: true });

  assert.equal(applyLessonCompletion(completed, "lessonB", false), true);
  assert.deepEqual(completed, { lessonA: true });
});
