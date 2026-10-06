import type {
	PlaybackDiagnostic,
	PlayerStoreApi,
	PlayerUrls,
	QueueItem,
	StreamResolution,
} from '@xsynaptic/player';

import { holdPresses } from '@xsynaptic/player/boot';
import '@xsynaptic/player/player.css';

import { fixtureOrigin, seekSeconds } from '#e2e/constants.ts';
import { labels } from '#test/labels.ts';

interface PlayerPage {
	diagnostics: Array<PlaybackDiagnostic>;
	readonly resolveCount: number;
	store: PlayerStoreApi;
}

declare global {
	interface Window {
		playerPage?: PlayerPage;
	}
}

const cued = {
	cuePoints: [{ artistLine: 'Cue Artist', startSeconds: 20, title: 'Cue Title' }],
	waveformOverview: Array.from(
		{ length: 64 },
		(_, index) => 0.3 + 0.5 * Math.abs(Math.sin(index / 5)),
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

const parameters = new URLSearchParams(location.search);

const settings = {
	bindDelay: Number(parameters.get('bindDelay') ?? 0),
	hasArchive: parameters.has('archive'),
	isCued: parameters.has('cued'),
	rows: (parameters.get('rows') ?? 'long,short').split(',').filter((row) => isFixture(row)),
	run: parameters.get('run') ?? 'manual',
	stream: readChoice('stream', ['audio', 'missing', 'garbage', 'hang', 'flaky', 'stalled']),
	type: readChoice('type', ['capital', 'lowercase']),
};

let resolveCount = 0;

const urls: PlayerUrls = {
	...(settings.hasArchive ? { archive: (item) => Promise.resolve(archiveUrl(item.itemId)) } : {}),
	stream: (item) => {
		resolveCount += 1;

		return Promise.resolve(resolveStream(item));
	},
};

function archiveUrl(itemId: string): string {
	const url = new URL(`/archive/${itemId}.dat`, fixtureOrigin);

	url.searchParams.set('run', settings.run);

	return url.href;
}

function isFixture(row: string): row is keyof typeof fixtures {
	return Object.hasOwn(fixtures, row);
}

function readChoice<Choice extends string>(
	name: string,
	choices: readonly [Choice, ...Array<Choice>],
): Choice {
	const value = parameters.get(name);

	return choices.find((choice) => choice === value) ?? choices[0];
}

// Read off the item, since a queue restored from storage carries the URL it was saved with
function resolveStream(item: QueueItem): StreamResolution {
	const url: unknown = Reflect.get(item, 'streamUrl');
	if (typeof url !== 'string') throw new Error(`No stream URL for ${item.itemId}`);

	return { status: 'ok', type: streamTypes[settings.type], url };
}

function streamUrl(itemId: string): string {
	const url = new URL(`/${settings.stream}/${itemId}.mp4`, fixtureOrigin);

	url.searchParams.set('run', settings.run);

	return url.href;
}

function wait(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}

function writePayload(): void {
	const items = settings.rows.map((itemId) => ({
		artistLine: 'Fixture Artist',
		artwork: [{ src: `${fixtureOrigin}/audio/art.png`, type: 'image/png', width: 512 }],
		durationMs: fixtures[itemId].durationMs,
		itemId,
		releaseTitle: 'Fixtures',
		streamUrl: streamUrl(itemId),
		title: fixtures[itemId].title,
		...(settings.isCued ? cued : {}),
	}));
	const payload = document.createElement('div');

	payload.dataset.playerPayload = JSON.stringify(items);
	payload.hidden = true;
	document.body.append(payload);
}

writePayload();

const presses = holdPresses(document);

await wait(settings.bindDelay);

const { bindMediaSession, bindPageControls, createPlayer, createPlayerStore } =
	await import('@xsynaptic/player');

const store = createPlayerStore();

document
	.querySelector('[data-player-host]')
	?.append(createPlayer({ labels, seekSeconds, store, urls }));

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
	} satisfies PlayerPage,
});
