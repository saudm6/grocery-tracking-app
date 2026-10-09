export function createSubmission(onPending?: (pending: boolean) => void) {
  let pending = false;
  let completed = false;
  return async <T>(save: () => Promise<T>): Promise<T | undefined> => {
    if (pending || completed) return undefined;
    pending = true;
    onPending?.(true);
    try {
      const result = await save();
      completed = true;
      return result;
    } finally {
      pending = false;
      onPending?.(false);
    }
  };
}
