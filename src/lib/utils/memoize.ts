// Caches the promise, not the resolved value, so concurrent callers during a build share one run
export function memoizeByKey<Key, Value>(build: (key: Key) => Promise<Value>) {
	const cache = new Map<Key, Promise<Value>>();

	return (key: Key) => {
		let promise = cache.get(key);

		if (promise === undefined) {
			promise = build(key);
			cache.set(key, promise);
		}

		return promise;
	};
}
