/** In-memory progress tracker for long-running bulk operations. */
const operationProgress = new Map<
  string,
  { total: number; completed: number; started: number }
>();

export function createOperation(key: string, total: number) {
  operationProgress.set(key, { total, completed: 0, started: Date.now() });
}

export function updateOperation(key: string, completed: number) {
  const op = operationProgress.get(key);
  if (op) op.completed = completed;
}

export function getOperation(key: string) {
  return operationProgress.get(key) ?? null;
}

export function deleteOperation(key: string) {
  operationProgress.delete(key);
}
