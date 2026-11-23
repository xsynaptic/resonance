export function observeResize(element: Element, onResize: () => void, signal: AbortSignal): void {
	const observer = new ResizeObserver(onResize);

	observer.observe(element);
	signal.addEventListener(
		'abort',
		() => {
			observer.disconnect();
		},
		{ once: true },
	);
}
