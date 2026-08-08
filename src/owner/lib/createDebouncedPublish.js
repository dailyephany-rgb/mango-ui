/**
 * Coalesce rapid Owner snapshot publishes (master + dept often fire back-to-back).
 * Call publish() from listeners; publishNow() from source-filter updates (immediate).
 */
export function createDebouncedPublish(fn, waitMs = 75) {
  let timer = null;

  const publishNow = (...args) => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    return fn(...args);
  };

  const publish = (...args) => {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };

  const cancel = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return { publish, publishNow, cancel };
}
