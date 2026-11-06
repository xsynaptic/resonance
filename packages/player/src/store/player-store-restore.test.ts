import { fc, test } from '@fast-check/vitest';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { queueDetailStorageKey, queueItemsStorageKey, queueStorageKey } from '#constants.ts';
import { definePlayerElements } from '#elements/define.ts';
import { createMockEngine } from '#engine/audio-engine-mock.ts';
import { bindMediaSession } from '#engine/media-session.ts';
import { createMemoryStorage } from '#lib/storage.ts';
import { createWritablePlayerStore } from '#store/player-store.ts';
import { currentCue, displayedDetail, displayedItem } from '#store/selectors.ts';
import { labels } from '#test/labels.ts';
import { openArchive } from '#waveform/waveform-archive.ts';

const anyJson = fc.jsonValue({ maxDepth: 3 });

function optionalField<Value>(
	valid: fc.Arbitrary<Value>,
	nearMiss: fc.Arbitrary<unknown> = anyJson,
) {
	return fc.option(
		fc.oneof(
			valid.map((value) => ({ isWritten: true, value })),
			anyJson.map((value) => ({ isWritten: false, value })),
			nearMiss.map((value) => ({ isWritten: false, value })),
		),
		{ nil: undefined },
	);
}

function withOneFieldBroken<Value extends object>(written: fc.Arbitrary<Value>) {
	return written.chain((value) =>
		fc
			.record({
				// Negatives are the dangerous case, since a negative length throws
				junk: fc.oneof(
					{ arbitrary: fc.integer({ max: -1, min: -20 }), weight: 4 },
					fc.string(),
					fc.boolean(),
				),
				key: fc.constantFrom(...Object.keys(value)),
			})
			.map(({ junk, key }) => ({ ...value, [key]: junk })),
	);
}

const writtenArtwork = fc.array(
	fc.record(
		{ src: fc.webUrl(), type: fc.constant('image/webp'), width: fc.integer({ max: 1200, min: 1 }) },
		{ noNullPrototype: true, requiredKeys: ['src', 'width'] },
	),
	{ maxLength: 3 },
);

const writtenCuePoints = fc.array(
	fc.record(
		{ artistLine: fc.string(), startSeconds: fc.integer({ max: 600, min: 0 }), title: fc.string() },
		{ noNullPrototype: true },
	),
	{ maxLength: 4 },
);

const writtenArchive = fc.record(
	{
		byteOffset: fc.integer({ max: 64, min: 0 }),
		pairCount: fc.integer({ max: 20_000, min: 0 }),
		pairsPerSecond: fc.integer({ max: 200, min: 1 }),
		url: fc.webUrl(),
	},
	{ noNullPrototype: true },
);

const storedItemFields = fc.record({
	artwork: optionalField(
		writtenArtwork,
		withOneFieldBroken(
			writtenArtwork.filter((artwork) => artwork.length > 0).map((artwork) => artwork[0]!),
		).map((rendition) => [rendition]),
	),
	durationMs: optionalField(fc.integer({ max: 3_600_000, min: 0 })),
	releaseHref: optionalField(fc.constant('/reviews/cosmic-drift/')),
});

const storedDetailFields = fc.record({
	archive: optionalField(writtenArchive, withOneFieldBroken(writtenArchive)),
	cuePoints: optionalField(
		writtenCuePoints,
		withOneFieldBroken(
			writtenCuePoints.filter((cues) => cues.length > 0).map((cues) => cues[0]!),
		).map((cue) => [cue]),
	),
	trackCount: optionalField(fc.integer({ max: 40, min: 0 })),
	waveformOverview: optionalField(fc.array(fc.double({ max: 1, min: 0, noNaN: true }))),
});

type StoredFields = Record<string, undefined | { isWritten: boolean; value: unknown }>;

function toStored(fields: StoredFields): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(fields).flatMap(([key, field]) => (field ? [[key, field.value]] : [])),
	);
}

function writtenKeys(fields: StoredFields): Array<string> {
	return Object.entries(fields).flatMap(([key, field]) => (field?.isWritten ? [key] : []));
}

function restore(itemFields: StoredFields, detailFields: StoredFields, currentTimeSeconds: number) {
	const storage = createMemoryStorage();
	const item = {
		artistLine: 'Nebula Drift',
		itemId: 'a',
		releaseTitle: 'Cosmic Drift',
		title: 'Track a',
		...toStored(itemFields),
	};

	storage.setItem(
		queueStorageKey,
		JSON.stringify({ currentIndex: 0, currentTimeSeconds, itemIds: ['a'] }),
	);
	storage.setItem(queueItemsStorageKey, JSON.stringify({ a: item }));
	storage.setItem(queueDetailStorageKey, JSON.stringify({ a: toStored(detailFields) }));

	return createWritablePlayerStore({ createEngine: createMockEngine().createEngine, storage });
}

beforeEach(() => {
	definePlayerElements();
	// happy-dom has no media session; this stub throws on non-finite values like browsers do
	const mediaSession = {
		metadata: undefined,
		playbackState: 'none',
		setActionHandler: vi.fn(),
		setPositionState: (state?: MediaPositionState) => {
			if (state === undefined) return;
			if ([state.duration, state.position].some((value) => !Number.isFinite(value))) {
				throw new TypeError('setPositionState takes finite values');
			}
		},
	};

	vi.stubGlobal('navigator', Object.create(navigator, { mediaSession: { value: mediaSession } }));
	// `new Object(init)` returns `init` itself, which is all we read
	vi.stubGlobal('MediaMetadata', Object);
});

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

describe('restoring a stored queue', () => {
	test.prop([storedItemFields, storedDetailFields, fc.integer({ max: 900, min: 0 })])(
		'whatever sits in the optional fields, the player mounts and keeps what it wrote',
		(itemFields, detailFields, currentTimeSeconds) => {
			const store = restore(itemFields, detailFields, currentTimeSeconds);
			const state = store.getState();
			const item = displayedItem(state);
			const detail = displayedDetail(state);

			expect(item?.itemId).toBe('a');

			for (const key of writtenKeys(itemFields)) expect(item).toHaveProperty(key);
			for (const key of writtenKeys(detailFields)) expect(detail).toHaveProperty(key);

			const unbind = bindMediaSession(store);
			const root = document.createElement('player-root');

			root.labels = labels;
			root.store = store;
			root.append(document.createElement('player-bar'));
			document.body.append(root);
			currentCue(state);
			if (detail?.archive) openArchive(detail.archive);

			root.remove();
			unbind();
		},
	);
});
