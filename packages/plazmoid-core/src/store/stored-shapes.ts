import type { BandsDescriptor, PeaksDescriptor } from '@xsynaptic/plazmoid-wavedata';

import type { Track, TrackDetail } from '#types.ts';

import { isRecord } from '#lib/is-record.ts';

type FieldChecks = Record<string, (value: unknown) => boolean>;

const trackChecks: FieldChecks = {
	artwork: (value) => isArrayOf(value, isArtwork),
	// `Intl.DurationFormat` throws past the safe-integer range
	durationMs: (value) => isNonNegativeNumber(value) && value <= Number.MAX_SAFE_INTEGER,
	releaseHref: (value) => typeof value === 'string',
};

const peaksChecks = {
	byteOffset: isCount,
	formatVersion: isCount,
	pairCount: isCount,
	pairsPerSecond: isPositiveNumber,
	rmsRange: (field) =>
		Array.isArray(field) && field.length === 2 && field.every((end) => isFiniteNumber(end)),
	url: (field) => typeof field === 'string',
} satisfies Record<Exclude<keyof PeaksDescriptor, 'bands'>, FieldChecks[string]>;

const bandsChecks = {
	bandCount: (field) => isCount(field) && field !== 0,
	byteOffset: isCount,
	frameCount: isCount,
	framesPerSecond: isPositiveNumber,
	medians: (field) => isArrayOf(field, isFiniteNumber),
	minDecibels: isFiniteNumber,
	url: (field) => typeof field === 'string',
} satisfies Record<keyof BandsDescriptor, FieldChecks[string]>;

const detailChecks: FieldChecks = {
	cuePoints: (value) => isArrayOf(value, isCuePoint),
	peaks: isPeaks,
	trackCount: isCount,
	waveformOverview: (value) => typeof value === 'string',
};

export function toStoredDetail(value: unknown): TrackDetail | undefined {
	if (!isRecord(value)) return undefined;

	const detail = keepValidFields(value, detailChecks);

	return isDetail(detail) ? detail : undefined;
}

// Unknown fields are kept because resolvers expect the track exactly as the host queued it
export function toStoredTrack(value: unknown): Track | undefined {
	if (!isRecord(value)) return undefined;

	const track = keepValidFields(value, trackChecks);

	return isTrack(track) ? track : undefined;
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

function isPeaks(value: unknown): boolean {
	if (!isRecord(value)) return false;

	return (
		hasFields(value, peaksChecks) &&
		(value.bands === undefined || hasFields(value.bands, bandsChecks))
	);
}

function isArrayOf(value: unknown, isValid: (track: unknown) => boolean): boolean {
	return Array.isArray(value) && value.every((track) => isValid(track));
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

function isDetail(value: unknown): value is TrackDetail {
	return isRecord(value) && hasOptionalFields(value, detailChecks);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isTrack(value: unknown): value is Track {
	if (!isRecord(value)) return false;

	return (
		['artistLine', 'trackId', 'releaseTitle', 'title'].every(
			(key) => typeof value[key] === 'string',
		) && hasOptionalFields(value, trackChecks)
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
