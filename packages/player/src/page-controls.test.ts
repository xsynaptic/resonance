import { afterEach, describe, expect, test, vi } from 'vitest';

import type { PlayerUrls, QueueItem } from '#types.ts';

import { heldPressAttribute } from '#constants.ts';
import { createMockEngine } from '#engine/audio-engine-mock.ts';
import { bindPageControls } from '#page-controls.ts';
import { createPlayerStore } from '#store/player-store.ts';
import { loadedItem } from '#store/selectors.ts';
import { queueItem } from '#test/mount.ts';

let unbind: (() => void) | undefined;

const urls: PlayerUrls = {
	stream: ({ itemId }) => Promise.resolve({ status: 'ok', url: `https://api.test/${itemId}` }),
};

afterEach(() => {
	unbind?.();
	unbind = undefined;
	document.body.replaceChildren();
});

function bindPage(items: Array<QueueItem>, controls: string) {
	const store = createPlayerStore({
		createEngine: createMockEngine().createEngine,
		isPersistent: false,
	});

	const onPress = vi.fn();

	store.getState().configure({ urls });
	document.body.innerHTML = `<div data-player-payload='${JSON.stringify(items)}' hidden></div>${controls}`;

	return {
		bind: () => {
			unbind = bindPageControls(store, document, { onPress });
		},
		onPress,
		store,
	};
}

function element(selector: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(selector);
	if (!found) throw new Error(`Nothing matches ${selector}`);

	return found;
}

describe('bindPageControls', () => {
	test('replays the press held before the player loaded', () => {
		const page = bindPage(
			[queueItem('a'), queueItem('b')],
			`<button data-play-track="b" ${heldPressAttribute}></button>`,
		);

		page.bind();

		expect(loadedItem(page.store.getState())?.itemId).toBe('b');
		expect(element('[data-play-track]').hasAttribute(heldPressAttribute)).toBe(false);
	});

	test('a track control beats the play-all wrapped around it, queueing without playing', () => {
		const page = bindPage(
			[queueItem('a'), queueItem('b')],
			'<div data-play-release><button data-queue-track="b"></button></div>',
		);

		page.bind();
		element('[data-queue-track]').click();

		expect(page.store.getState().queue.map((item) => item.itemId)).toEqual(['a', 'b']);
		expect(loadedItem(page.store.getState())).toBeUndefined();
	});

	test('refreshes the queue from the payload on binding and after a soft navigation', () => {
		const page = bindPage([queueItem('a', { title: 'New' })], '');

		page.store.getState().loadQueue([queueItem('a', { title: 'Old' })]);
		page.bind();

		expect(page.store.getState().queue[0]?.title).toBe('New');

		element('[data-player-payload]').dataset.playerPayload = JSON.stringify([
			queueItem('a', { title: 'Newer' }),
		]);
		document.dispatchEvent(new Event('astro:after-swap'));

		expect(page.store.getState().queue[0]?.title).toBe('Newer');
	});

	test('marks the loaded track on the page, and again on the page swapped in', () => {
		const page = bindPage(
			[queueItem('a'), queueItem('b')],
			'<button data-play-track="a"></button><div data-track-id="a"></div><div data-track-id="b"></div>',
		);

		page.bind();
		element('[data-play-track]').click();

		expect(element('[data-track-id="a"]').dataset.playing).toBe('');
		expect(element('[data-track-id="b"]').dataset.loaded).toBeUndefined();

		element('[data-track-id="a"]').remove();
		document.body.insertAdjacentHTML('beforeend', '<div data-track-id="a" id="swapped"></div>');
		document.dispatchEvent(new Event('astro:after-swap'));

		expect(element('#swapped').dataset.loaded).toBe('');

		page.store.getState().togglePaused();

		expect(element('#swapped').dataset.playing).toBeUndefined();
	});

	test('leaves the page alone once unbound', () => {
		const page = bindPage([queueItem('a')], '<button data-play-track="a"></button>');

		page.bind();
		unbind?.();
		element('[data-play-track]').click();

		expect(loadedItem(page.store.getState())).toBeUndefined();
	});

	test('reports the queued track, which beats the play-all wrapped around it', () => {
		const page = bindPage(
			[queueItem('a'), queueItem('b')],
			'<div data-play-release><button data-queue-track="b"></button></div>',
		);

		page.bind();
		element('[data-queue-track]').click();

		expect(page.onPress).toHaveBeenCalledWith({ itemIds: ['b'], verb: 'queue-track' });
	});

	test('reports the pressed track, which beats the play-all wrapped around it', () => {
		const page = bindPage(
			[queueItem('a'), queueItem('b')],
			'<div data-play-release><button data-play-track="b"></button></div>',
		);

		page.bind();
		element('[data-play-track]').click();

		expect(page.onPress).toHaveBeenCalledWith({ itemIds: ['b'], verb: 'play-track' });
	});

	test('reports a station in the order it queued, so the first id is what starts', () => {
		const page = bindPage(
			[queueItem('a'), queueItem('b'), queueItem('c')],
			'<button data-play-queue="c a"></button>',
		);

		page.bind();
		element('[data-play-queue]').click();

		expect(page.onPress).toHaveBeenCalledWith({ itemIds: ['c', 'a'], verb: 'play-queue' });
	});

	test('a press on the Station tuned in pauses and resumes in place', () => {
		const page = bindPage(
			[queueItem('a'), queueItem('b'), queueItem('c')],
			'<button data-play-queue="b c"></button>',
		);

		page.bind();
		page.store.getState().playTrack([queueItem('a'), queueItem('b')], 'b');
		page.store.getState().seek(120);
		element('[data-play-queue]').click();

		expect(page.store.getState().isPaused).toBe(true);
		expect(page.store.getState().queue.map((item) => item.itemId)).toEqual(['a', 'b']);
		expect(loadedItem(page.store.getState())?.itemId).toBe('b');
		expect(page.store.getState().currentTimeSeconds).toBe(120);
		expect(page.onPress).toHaveBeenCalledWith({ itemIds: ['b', 'c'], verb: 'toggle-queue' });

		element('[data-play-queue]').click();

		expect(page.store.getState().isPaused).toBe(false);
		expect(page.store.getState().currentTimeSeconds).toBe(120);
	});

	test('a press on a Station not tuned in replaces the Playlist', () => {
		const page = bindPage(
			[queueItem('a'), queueItem('b'), queueItem('c')],
			'<button data-play-queue="c b"></button>',
		);

		page.bind();
		page.store.getState().playTrack([queueItem('a')], 'a');
		element('[data-play-queue]').click();

		expect(page.store.getState().queue.map((item) => item.itemId)).toEqual(['c', 'b']);
		expect(loadedItem(page.store.getState())?.itemId).toBe('c');
		expect(page.store.getState().isPaused).toBe(false);
	});

	test('marks every Station holding the loaded Mix while it plays', () => {
		const page = bindPage(
			[queueItem('a'), queueItem('b')],
			'<button data-play-queue="a b" id="first"></button><button data-play-queue="b" id="second"></button>',
		);

		page.bind();
		element('#first').click();

		expect(element('#first').dataset.playing).toBe('');
		expect(element('#second').dataset.playing).toBeUndefined();

		page.store.getState().next();

		expect(element('#first').dataset.playing).toBe('');
		expect(element('#second').dataset.playing).toBe('');

		page.store.getState().togglePaused();

		expect(element('#first').dataset.playing).toBeUndefined();
		expect(element('#second').dataset.playing).toBeUndefined();
	});

	test('reports a release with every item it queued', () => {
		const page = bindPage([queueItem('a'), queueItem('b')], '<button data-play-release></button>');

		page.bind();
		element('[data-play-release]').click();

		expect(page.onPress).toHaveBeenCalledWith({ itemIds: ['a', 'b'], verb: 'play-release' });
	});

	test('adds the track to the playlist once, however often it is pressed', () => {
		const page = bindPage(
			[queueItem('a')],
			'<div data-track-id="a"><button data-queue-track="a"></button></div>',
		);

		page.bind();
		element('[data-queue-track]').click();
		element('[data-queue-track]').click();

		expect(page.store.getState().queue.map((item) => item.itemId)).toEqual(['a']);
		expect(page.onPress).toHaveBeenCalledWith({ itemIds: ['a'], verb: 'queue-track' });
	});

	test('marks the queued track and disables the button that adds it', () => {
		const page = bindPage(
			[queueItem('a')],
			'<div data-track-id="a"><button data-queue-track="a"></button></div>',
		);

		page.bind();

		expect(element('[data-track-id="a"]').dataset.queued).toBeUndefined();
		expect(element('[data-queue-track]').hasAttribute('disabled')).toBe(false);

		element('[data-queue-track]').click();

		expect(element('[data-track-id="a"]').dataset.queued).toBe('');
		expect(element('[data-queue-track]').hasAttribute('disabled')).toBe(true);
	});

	test('playing a track queues it, so its add button disables too', () => {
		const page = bindPage(
			[queueItem('a')],
			'<div data-track-id="a"><button data-queue-track="a"></button><button data-play-track="a"></button></div>',
		);

		page.bind();
		element('[data-play-track]').click();

		expect(element('[data-queue-track]').hasAttribute('disabled')).toBe(true);
	});
});
