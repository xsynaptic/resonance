const listeners = new Set<() => void>();

let observer: MutationObserver | undefined;

export function subscribeTheme(onChange: () => void): () => void {
	listeners.add(onChange);

	if (observer === undefined) {
		observer = new MutationObserver(() => {
			for (const listener of listeners) listener();
		});

		observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
	}

	return () => {
		listeners.delete(onChange);

		if (listeners.size > 0) return;

		observer?.disconnect();
		observer = undefined;
	};
}
