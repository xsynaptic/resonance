import type { createPlayerStore, PlayerUrls, QueueItem, StreamResolution } from '@xsynaptic/player';

import {
	controlSelector,
	heldPressAttribute,
	heldPressSelector,
} from '@xsynaptic/player/constants';
import '@xsynaptic/player/player.css';

import { fixtureOrigin, seekSeconds } from '#e2e/constants.ts';
import { labels } from '#test/labels.ts';

interface PlayerPage {
	readonly resolveCount: number;
	store: ReturnType<typeof createPlayerStore>;
}

declare global {
	interface Window {
		playerPage?: PlayerPage;
	}
}

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
	rows: (parameters.get('rows') ?? 'long,short').split(',').filter((row) => isFixture(row)),
	run: parameters.get('run') ?? 'manual',
	stream: readChoice('stream', ['audio', 'missing', 'garbage', 'hang', 'flaky']),
	type: readChoice('type', ['capital', 'lowercase']),
};

let resolveCount = 0;

const urls: PlayerUrls = {
	stream: (item) => {
		resolveCount += 1;

		return Promise.resolve(resolveStream(item));
	},
};

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
	}));
	const payload = document.createElement('div');

	payload.dataset.playerPayload = JSON.stringify(items);
	payload.hidden = true;
	document.body.append(payload);
}

writePayload();

const holding = new AbortController();

document.addEventListener(
	'click',
	(event) => {
		if (!(event.target instanceof Element)) return;

		const pressed = event.target.closest(controlSelector);
		if (!pressed) return;

		document.querySelector(heldPressSelector)?.removeAttribute(heldPressAttribute);
		pressed.toggleAttribute(heldPressAttribute, true);
	},
	{ capture: true, signal: holding.signal },
);

await wait(settings.bindDelay);

const { bindMediaSession, bindPageControls, definePlayerElements, playerStore } =
	await import('@xsynaptic/player');

definePlayerElements();

const root = document.createElement('player-root');

root.className = 'player';
root.toggleAttribute('is-primary', true);
root.labels = labels;
root.seekSeconds = seekSeconds;
root.store = playerStore;
root.urls = urls;
root.append(document.createElement('player-bar'));
document.querySelector('[data-player-host]')?.append(root);

holding.abort();
bindPageControls(playerStore, document);
bindMediaSession(playerStore, seekSeconds);

Object.defineProperty(window, 'playerPage', {
	value: {
		get resolveCount() {
			return resolveCount;
		},
		store: playerStore,
	} satisfies PlayerPage,
});
