import type { QueueItem } from '#types.ts';

export function identityOrder(length: number): Array<number> {
	return Array.from({ length }, (_, index) => index);
}

// `undefined` at the end; a queue plays through once
export function nextInOrder(
	playOrder: ReadonlyArray<number>,
	currentIndex: number,
): number | undefined {
	const position = playOrder.indexOf(currentIndex);
	if (position === -1) return undefined;

	return playOrder[position + 1];
}

export function previousInOrder(
	playOrder: ReadonlyArray<number>,
	currentIndex: number,
): number | undefined {
	const position = playOrder.indexOf(currentIndex);
	if (position <= 0) return undefined;

	return playOrder[position - 1];
}

export function shuffledOrder(
	length: number,
	currentIndex: number | undefined,
	random: () => number = Math.random,
): Array<number> {
	const rest = identityOrder(length).filter((index) => index !== currentIndex);

	for (let index = rest.length - 1; index > 0; index -= 1) {
		const swap = Math.floor(random() * (index + 1));
		const atIndex = rest[index];
		const atSwap = rest[swap];
		if (atIndex === undefined || atSwap === undefined) continue;

		rest[index] = atSwap;
		rest[swap] = atIndex;
	}

	if (currentIndex === undefined) return rest;

	return [currentIndex, ...rest];
}

// Durations are carried in milliseconds and read in seconds everywhere they are used
export function toDurationSeconds(item: QueueItem | undefined): number | undefined {
	return item?.durationMs === undefined ? undefined : item.durationMs / 1000;
}
