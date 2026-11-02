/** Shared read-only requests: deduplicate, bound concurrency and release obsolete work. */
export function createRequestPool(limit = 3) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Invalid concurrency');
  const entries = new Map(), queue = [];
  let running = 0;
  const aborted = () => new DOMException('Request cancelled', 'AbortError');
  function pump() {
    queue.sort((a, b) => b.priority - a.priority);
    while (running < limit && queue.length) {
      const item = queue.shift();
      if (item.cancelled) continue;
      item.started = true;
      running++;
      Promise.resolve().then(() => {
        if (item.controller.signal.aborted) throw aborted();
        return item.task(item.controller.signal);
      }).then(value => {
        if (item.controller.signal.aborted) throw aborted();
        item.resolve(value);
      }).catch(item.reject).finally(() => {
        running--;
        if (entries.get(item.key) === item) entries.delete(item.key);
        pump();
      });
    }
  }
  function run(key, task, {priority = 0} = {}) {
    const existing = entries.get(key);
    if (existing) {
      existing.priority = Math.max(existing.priority, priority);
      return existing.promise;
    }
    const item = {key, task, priority, controller: new AbortController()};
    item.promise = new Promise((resolve, reject) => Object.assign(item, {resolve, reject}));
    entries.set(key, item);
    queue.push(item);
    pump();
    return item.promise;
  }
  function cancel({backgroundOnly = false} = {}) {
    for (const [key, item] of entries) {
      if (backgroundOnly && item.priority > 0) continue;
      entries.delete(key);
      item.cancelled = true;
      item.controller.abort();
      if (!item.started) item.reject(aborted());
    }
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].cancelled) queue.splice(i, 1);
    pump();
  }
  return {run, cancel};
}