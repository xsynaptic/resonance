import { fc, test } from '@fast-check/vitest';
import {
	bindMediaSession,
	createMemoryStorage,
	currentCue,
	displayedDetail,
	displayedTrack,
} from '@xsynaptic/plazmoid-core';
import {
	queueDetailStorageKey,
	queueStorageKey,
	queueTracksStorageKey,
} from '@xsynaptic/plazmoid-core/constants';
import { createMockEngine, createWritablePlayerStore } from '@xsynaptic/plazmoid-core/testing';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { definePlayerElements } from '#elements/define.ts';
import { labels } from '#test/labels.ts';
import { createViewStore } from '#view/view-store.ts';
import { openPeaks } from '#waveform/waveform-peaks.ts';

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

const writtenPeaks = fc.record(
	{
		byteOffset: fc.integer({ max: 64, min: 0 }),
		pairCount: fc.integer({ max: 20_000, min: 0 }),
		pairsPerSecond: fc.integer({ max: 200, min: 1 }),
		rmsRange: fc.tuple(fc.integer({ max: 20, min: 0 }), fc.integer({ max: 127, min: 20 })),
		url: fc.webUrl(),
	},
	{ noNullPrototype: true },
);

const storedTrackFields = fc.record({
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
	cuePoints: optionalField(
		writtenCuePoints,
		withOneFieldBroken(
			writtenCuePoints.filter((cues) => cues.length > 0).map((cues) => cues[0]!),
		).map((cue) => [cue]),
	),
	peaks: optionalField(writtenPeaks, withOneFieldBroken(writtenPeaks)),
	trackCount: optionalField(fc.integer({ max: 40, min: 0 })),
	waveformOverview: optionalField(fc.base64String()),
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

function restore(
	trackFields: StoredFields,
	detailFields: StoredFields,
	currentTimeSeconds: number,
) {
	const storage = createMemoryStorage();
	const track = {
		artistLine: 'Nebula Drift',
		releaseTitle: 'Cosmic Drift',
		title: 'Track a',
		trackId: 'a',
		...toStored(trackFields),
	};

	storage.setItem(
		queueStorageKey,
		JSON.stringify({ currentIndex: 0, currentTimeSeconds, trackIds: ['a'] }),
	);
	storage.setItem(queueTracksStorageKey, JSON.stringify({ a: track }));
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
	test.prop([storedTrackFields, storedDetailFields, fc.integer({ max: 900, min: 0 })])(
		'whatever sits in the optional fields, the restored queue keeps what it wrote',
		(trackFields, detailFields, currentTimeSeconds) => {
			const state = restore(trackFields, detailFields, currentTimeSeconds).getState();
			const track = displayedTrack(state);
			const detail = displayedDetail(state);

			expect(track?.trackId).toBe('a');

			for (const key of writtenKeys(trackFields)) expect(track).toHaveProperty(key);
			for (const key of writtenKeys(detailFields)) expect(detail).toHaveProperty(key);
		},
	);

	test.prop([storedTrackFields, storedDetailFields, fc.integer({ max: 900, min: 0 })], {
		numRuns: 20,
	})(
		'whatever sits in the optional fields, the player mounts',
		(trackFields, detailFields, currentTimeSeconds) => {
			const store = restore(trackFields, detailFields, currentTimeSeconds);
			const state = store.getState();
			const detail = displayedDetail(state);
			const unbind = bindMediaSession(store);
			const root = document.createElement('pzm-root');

			root.labels = labels;
			root.store = store;
			root.view = createViewStore({ storage: createMemoryStorage() });
			root.append(document.createElement('pzm-bar'));
			document.body.append(root);
			currentCue(state);
			if (detail?.peaks) openPeaks(detail.peaks);

			root.remove();
			unbind();
		},
	);
});
