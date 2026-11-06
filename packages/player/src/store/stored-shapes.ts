import type { QueueItem, QueueItemDetail } from '#types.ts';

import { isRecord } from '#lib/is-record.ts';

type FieldChecks = Record<string, (value: unknown) => boolean>;

const itemChecks: FieldChecks = {
	artwork: (value) => isArrayOf(value, isArtwork),
	// `Intl.DurationFormat` throws past the safe-integer range
	durationMs: (value) => isNonNegativeNumber(value) && value <= Number.MAX_SAFE_INTEGER,
	releaseHref: (value) => typeof value === 'string',
};

const detailChecks: FieldChecks = {
	archive: isArchive,
	cuePoints: (value) => isArrayOf(value, isCuePoint),
	trackCount: isCount,
	waveformOverview: (value) => isArrayOf(value, isFiniteNumber),
};

export function toStoredDetail(value: unknown): QueueItemDetail | undefined {
	if (!isRecord(value)) return undefined;

	const detail = keepValidFields(value, detailChecks);

	return isDetail(detail) ? detail : undefined;
}

// Unknown fields are kept because resolvers expect the item exactly as the host queued it
export function toStoredItem(value: unknown): QueueItem | undefined {
	if (!isRecord(value)) return undefined;

	const item = keepValidFields(value, itemChecks);

	return isItem(item) ? item : undefined;
}

function hasFields(value: unknown, checks: FieldChecks): boolean {
	if (!isRecord(value)) return false;

	return Object.entries(checks).every(([key, isValid]) => isValid(value[key]));
}

function hasOptionalFields(value: Record<string, unknown>, checks: FieldChecks): boolean {
	return Object.entries(checks).every(
		([key, isValid]) => value[key] === undefined || isValid(value[key]),
	);
}

function isArchive(value: unknown): boolean {
	if (!isRecord(value)) return false;

	return (
		hasFields(value, {
			byteOffset: isCount,
			pairCount: isCount,
			pairsPerSecond: isPositiveNumber,
			url: (field) => typeof field === 'string',
		}) &&
		(value.bands === undefined ||
			hasFields(value.bands, {
				bandCount: (field) => isCount(field) && field !== 0,
				byteOffset: isCount,
				frameCount: isCount,
				framesPerSecond: isPositiveNumber,
				minDecibels: isFiniteNumber,
				url: (field) => typeof field === 'string',
			}))
	);
}

function isArrayOf(value: unknown, isValid: (item: unknown) => boolean): boolean {
	return Array.isArray(value) && value.every((item) => isValid(item));
}

function isArtwork(value: unknown): boolean {
	if (!isRecord(value)) return false;

	return (
		typeof value.src === 'string' &&
		isPositiveNumber(value.width) &&
		(value.type === undefined || typeof value.type === 'string')
	);
}

function isCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCuePoint(value: unknown): boolean {
	return hasFields(value, {
		artistLine: (field) => typeof field === 'string',
		startSeconds: isNonNegativeNumber,
		title: (field) => typeof field === 'string',
	});
}

function isDetail(value: unknown): value is QueueItemDetail {
	return isRecord(value) && hasOptionalFields(value, detailChecks);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isItem(value: unknown): value is QueueItem {
	if (!isRecord(value)) return false;

	return (
		['artistLine', 'itemId', 'releaseTitle', 'title'].every(
			(key) => typeof value[key] === 'string',
		) && hasOptionalFields(value, itemChecks)
	);
}

function isNonNegativeNumber(value: unknown): value is number {
	return isFiniteNumber(value) && value >= 0;
}

function isPositiveNumber(value: unknown): boolean {
	return isFiniteNumber(value) && value > 0;
}

function keepValidFields(value: Record<string, unknown>, checks: FieldChecks) {
	return Object.fromEntries(
		Object.entries(value).filter(([key, field]) => checks[key]?.(field) ?? true),
	);
}
