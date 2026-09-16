export function nextTabIndex(key: string, index: number, count: number): number | undefined {
	switch (key) {
		case 'ArrowLeft': {
			return (index - 1 + count) % count;
		}
		case 'ArrowRight': {
			return (index + 1) % count;
		}
		case 'End': {
			return count - 1;
		}
		case 'Home': {
			return 0;
		}
		default: {
			return undefined;
		}
	}
}
