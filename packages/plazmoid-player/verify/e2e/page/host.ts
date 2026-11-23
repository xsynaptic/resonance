import type {
	PlaybackDiagnostic,
	PlayerStoreApi,
	PlayerUrls,
	StreamResolution,
	Track,
	TrackDetail,
} from '@xsynaptic/plazmoid-core';
import type { ViewStoreApi } from '@xsynaptic/plazmoid-player';

import { holdPresses } from '@xsynaptic/plazmoid-core/boot';
import { describeWavedata } from '@xsynaptic/plazmoid-wavedata';
import '@xsynaptic/plazmoid-player/player.css';

import { fixtureOrigin, seekSeconds } from '#e2e/constants.ts';
import { fixturePeaks } from '#e2e/fixture-peaks.ts';
import { defaultLabels } from '#labels.ts';

interface PlayerPage {
	diagnostics: Array<PlaybackDiagnostic>;
	readonly resolveCount: number;
	store: PlayerStoreApi;
	view: ViewStoreApi;
}

declare global {
	interface Window {
		playerPage?: PlayerPage;
	}
}

const cued: TrackDetail = {
	cuePoints: [{ artistLine: 'Cue Artist', startSeconds: 20, title: 'Cue Title' }],
	waveformOverview: btoa(
		String.fromCodePoint(
			...Array.from({ length: 64 }, (_, index) =>
				Math.round(255 * (0.3 + 0.5 * Math.abs(Math.sin(index / 5)))),
			),
		),
	),
};

const fixtures = {
	long: { durationMs: 60_000, title: 'Long fixture' },
	short: { durationMs: 6000, title: 'Short fixture' },
} as const;

const streamTypes = {
	capital: 'audio/mp4; codecs="Opus"',
	lowercase: 'audio/mp4; codecs="opus"',
} as const;

const unplayableType = 'audio/x-unplayable';

const parameters = new URLSearchParams(location.search);

const settings = {
	bindDelay: Number(parameters.get('bindDelay') ?? 0),
	detail: readChoice('detail', ['answer', 'hang']),
	hasFallback: parameters.has('fallback'),
	hasPeaks: parameters.has('peaks'),
	isCued: parameters.has('cued'),
	peaksVersion: readNumber('peaksVersion'),
	rows: (parameters.get('rows') ?? 'long,short').split(',').filter((row) => isFixture(row)),
	run: parameters.get('run') ?? 'manual',
	stream: readChoice('stream', ['audio', 'missing', 'garbage', 'hang', 'flaky', 'stalled']),
	type: readChoice('type', ['capital', 'lowercase']),
};

const { byteOffset, formatVersion, pairCount, pairsPerSecond, rmsRange } = describeWavedata({
	peaks: fixturePeaks,
});

let resolveCount = 0;

const unanswered = new Promise<undefined>(() => {
	// Never settles, as a Library fetch still in flight
});

const urls: PlayerUrls = {
	detail: (track) => (settings.detail === 'hang' ? unanswered : Promise.resolve(detailOf(track))),
	stream: (track) => {
		resolveCount += 1;

		return Promise.resolve(resolveStream(track));
	},
};

function detailOf({ trackId }: Track): TrackDetail {
	return {
		...(settings.isCued ? cued : {}),
		...(settings.hasPeaks
			? {
					peaks: {
						byteOffset,
						formatVersion: settings.peaksVersion ?? formatVersion,
						pairCount,
						pairsPerSecond,
						rmsRange,
						url: peaksUrl(trackId),
					},
				}
			: {}),
	};
}

function peaksUrl(trackId: string): string {
	const url = new URL(`/peaks/${trackId}.peaks.bin`, fixtureOrigin);

	url.searchParams.set('run', settings.run);

	return url.href;
}

function isFixture(row: string): row is keyof typeof fixtures {
	return Object.hasOwn(fixtures, row);
}

function readNumber(name: string): number | undefined {
	const value = parameters.get(name);

	return value === null ? undefined : Number(value);
}

function readChoice<Choice extends string>(
	name: string,
	choices: readonly [Choice, ...Array<Choice>],
): Choice {
	const value = parameters.get(name);

	return choices.find((choice) => choice === value) ?? choices[0];
}

// Read off the track, since a queue restored from storage carries the URL it was saved with
function resolveStream(track: Track): StreamResolution {
	const url: unknown = Reflect.get(track, 'streamUrl');
	if (typeof url !== 'string') throw new TypeError(`No stream URL for ${track.trackId}`);

	const source = { type: streamTypes[settings.type], url };

	if (!settings.hasFallback) return { sources: [source], status: 'ok' };

	return {
		sources: [{ type: unplayableType, url: refusedUrl(track.trackId) }, source],
		status: 'ok',
	};
}

function refusedUrl(trackId: string): string {
	const url = new URL(`/garbage/${trackId}.mp4`, fixtureOrigin);

	url.searchParams.set('run', settings.run);

	return url.href;
}

function streamUrl(trackId: string): string {
	const url = new URL(`/${settings.stream}/${trackId}.mp4`, fixtureOrigin);

	url.searchParams.set('run', settings.run);

	return url.href;
}

function wait(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}

function writePayload(): void {
	const tracks = settings.rows.map((trackId) => ({
		artistLine: 'Fixture Artist',
		artwork: [{ src: `${fixtureOrigin}/audio/art.png`, type: 'image/png', width: 512 }],
		durationMs: fixtures[trackId].durationMs,
		releaseTitle: 'Fixtures',
		streamUrl: streamUrl(trackId),
		title: fixtures[trackId].title,
		trackId,
	}));
	const payload = document.createElement('div');

	payload.dataset.pzmPayload = JSON.stringify(tracks);
	payload.hidden = true;
	document.body.append(payload);
}

writePayload();

const presses = holdPresses(document);

await wait(settings.bindDelay);

const [
	{ bindMediaSession, bindPageControls, createPlayerStore },
	{ createPlayer, createViewStore },
] = await Promise.all([import('@xsynaptic/plazmoid-core'), import('@xsynaptic/plazmoid-player')]);

const store = createPlayerStore();
const view = createViewStore();

document
	.querySelector('[data-player-host]')
	?.append(createPlayer({ labels: defaultLabels, seekSeconds, store, urls, view }));

bindPageControls(store, document);
presses.release();
bindMediaSession(store);

// The store keeps only the latest; the site sends every one, so a spec reads them all
const diagnostics: Array<PlaybackDiagnostic> = [];

store.subscribe((state, previous) => {
	if (!state.diagnostic || state.diagnostic === previous.diagnostic) return;

	diagnostics.push(state.diagnostic);
});

Object.defineProperty(window, 'playerPage', {
	value: {
		diagnostics,
		get resolveCount() {
			return resolveCount;
		},
		store,
		view,
	} satisfies PlayerPage,
});
