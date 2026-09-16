// Property syntax so a caller can hand one of these straight on without tripping `unbound-method`
export interface Supersede {
	cancel: () => void;
	next: () => AbortSignal;
}

// One nested lifetime at a time: starting the next ends the one before it, and the owner's abort ends the last
export function supersede(signal: AbortSignal): Supersede {
	let current: AbortController | undefined;

	const cancel = (): void => {
		current?.abort();
		current = undefined;
	};

	signal.addEventListener('abort', cancel, { once: true });

	return {
		cancel,
		next: () => {
			cancel();
			current = new AbortController();

			return current.signal;
		},
	};
}
