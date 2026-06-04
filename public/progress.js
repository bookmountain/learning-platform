export function applyLessonCompletion(completed, lessonId, complete) {
  const nextComplete = Boolean(complete);
  const isComplete = Boolean(completed[lessonId]);
  if (isComplete === nextComplete) return false;

  if (nextComplete) completed[lessonId] = true;
  else delete completed[lessonId];

  return true;
}
