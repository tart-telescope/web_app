/**
 * Run an async worker over a list with a bound on how many run at once.
 *
 * For loading files: the downloads overlap, which is where the time goes, while
 * the parsing stays on one thread regardless because the wasm is single
 * threaded. So the useful bound is small — enough files in flight to keep the
 * network busy without holding every file's parsed data in memory at once.
 *
 * The worker is expected to handle its own failures. A rejection here would
 * abandon the remaining items silently rather than reporting which ones failed.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit how many workers to run at once; at least 1
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>} results in the order the items were given
 */
export async function mapWithConcurrency(items, limit, worker) {
  const size = Math.min(Math.max(1, Math.floor(limit) || 1), items.length);
  const results = Array.from({ length: items.length });
  let next = 0;

  /** Each runner takes the next free index until the list is exhausted. */
  async function run() {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: size }, run));

  return results;
}
