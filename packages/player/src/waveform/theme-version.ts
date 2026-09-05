const listeners = new Set<() => void>();

let observer: MutationObserver | undefined;
let version = 0;

export function getThemeVersion(): number {
	return version;
}

export function subscribeTheme(onChange: () => void): () => void {
	listeners.add(onChange);

	if (observer === undefined) {
		observer = new MutationObserver(() => {
			version += 1;

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
