export interface GhostMarker {
	place(offsetSeconds: number | undefined): void;
}

export function createGhostMarker(root: HTMLElement, pxPerSecond: number): GhostMarker {
	let isHidden = true;
	let x = NaN;

	return {
		place(offsetSeconds) {
			if (offsetSeconds === undefined) {
				if (isHidden) return;

				isHidden = true;
				root.toggleAttribute('hidden', true);

				return;
			}

			const nextX = offsetSeconds * pxPerSecond;

			if (nextX !== x) {
				x = nextX;
				root.style.translate = `${nextX.toFixed(2)}px`;
			}

			if (isHidden) {
				isHidden = false;
				root.toggleAttribute('hidden', false);
			}
		},
	};
}
