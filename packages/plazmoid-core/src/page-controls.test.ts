import { afterEach, describe, expect, test, vi } from 'vitest';

import type { PageControls } from '#page-controls.ts';
import type { PlayerUrls, Track } from '#types.ts';

import { heldPressAttribute } from '#constants.ts';
import { createMockEngine } from '#engine/audio-engine-mock.ts';
import { createMemoryStorage } from '#lib/storage.ts';
import { bindPageControls } from '#page-controls.ts';
import { createWritablePlayerStore } from '#store/player-store.ts';
import { loadedTrack } from '#store/selectors.ts';
import { makeTrack } from '#test/player-store.ts';

let pageControls: PageControls | undefined;

const urls: PlayerUrls = {
	stream: ({ trackId }) => Promise.resolve({ status: 'ok', url: `https://api.test/${trackId}` }),
};

afterEach(() => {
	pageControls?.unbind();
	pageControls = undefined;
	document.body.replaceChildren();
});

function bindPage(tracks: Array<Track>, controls: string) {
	const fake = createMockEngine();
	const store = createWritablePlayerStore({
		createEngine: fake.createEngine,
		storage: createMemoryStorage(),
	});

	const onPress = vi.fn();

	store.getState().configure({ urls });
	document.body.innerHTML = `<div data-pzm-payload='${JSON.stringify(tracks)}' hidden></div>${controls}`;

	return {
		bind: () => {
			pageControls = bindPageControls(store, document, { onPress });
		},
		fake,
		onPress,
		store,
	};
}

function element(selector: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(selector);
	if (!found) throw new Error(`Nothing matches ${selector}`);

	return found;
}

function cueList(mixId: string): string {
	return `<ol data-pzm-cue-track="${mixId}"><li data-pzm-cue-seconds="0"></li><li data-pzm-cue-seconds="60"></li></ol>`;
}

function currentCueRows(): Array<string> {
	return [...document.querySelectorAll<HTMLElement>('[data-pzm-cue-current]')].map(
		(row) =>
			`${String(row.closest('ol')?.dataset.pzmCueTrack)}@${String(row.dataset.pzmCueSeconds)}`,
	);
}

describe('bindPageControls', () => {
	test('replays the press held before the player loaded', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b')],
			`<button data-pzm-play-track="b" ${heldPressAttribute}></button>`,
		);

		page.bind();

		expect(loadedTrack(page.store.getState())?.trackId).toBe('b');
		expect(element('[data-pzm-play-track]').hasAttribute(heldPressAttribute)).toBe(false);
	});

	test('a track control beats the play-all wrapped around it, queueing without playing', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b')],
			'<div data-pzm-play-tracks="a b"><button data-pzm-queue-track="b"></button></div>',
		);

		page.bind();
		element('[data-pzm-queue-track]').click();

		expect(page.store.getState().queue.map((track) => track.trackId)).toEqual(['a', 'b']);
		expect(loadedTrack(page.store.getState())).toBeUndefined();
	});

	test('refreshes the queue from the payload on binding and on a refresh', () => {
		const page = bindPage([{ ...makeTrack('a'), title: 'New' }], '');

		page.store.getState().loadQueue([{ ...makeTrack('a'), title: 'Old' }]);
		page.bind();

		expect(page.store.getState().queue[0]?.title).toBe('New');

		element('[data-pzm-payload]').dataset.pzmPayload = JSON.stringify([
			{ ...makeTrack('a'), title: 'Newer' },
		]);
		pageControls?.refresh();

		expect(page.store.getState().queue[0]?.title).toBe('Newer');
	});

	test('marks the loaded track on the page, and again after a refresh', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b')],
			'<button data-pzm-play-track="a"></button><div data-pzm-track-id="a"></div><div data-pzm-track-id="b"></div>',
		);

		page.bind();
		element('[data-pzm-play-track]').click();

		expect(element('[data-pzm-track-id="a"]').dataset.pzmPlaying).toBe('');
		expect(element('[data-pzm-track-id="b"]').dataset.pzmLoaded).toBeUndefined();

		element('[data-pzm-track-id="a"]').remove();
		document.body.insertAdjacentHTML('beforeend', '<div data-pzm-track-id="a" id="swapped"></div>');
		pageControls?.refresh();

		expect(element('#swapped').dataset.pzmLoaded).toBe('');

		page.store.getState().togglePaused();

		expect(element('#swapped').dataset.pzmPlaying).toBeUndefined();
	});

	test("marks the current cue only in the loaded track's cue list", () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b')],
			`<button data-pzm-play-track="a"></button>${cueList('a')}${cueList('b')}`,
		);

		page.bind();
		element('[data-pzm-play-track]').click();
		page.store.setState({
			details: new Map([
				[
					'a',
					{
						cuePoints: [
							{ artistLine: '', startSeconds: 0, title: 'Opening' },
							{ artistLine: '', startSeconds: 60, title: 'Second' },
						],
					},
				],
			]),
		});
		page.fake.callbacks.current?.onTime(90);

		expect(currentCueRows()).toEqual(['a@60']);

		page.fake.callbacks.current?.onTime(30);

		expect(currentCueRows()).toEqual(['a@0']);
	});

	test('leaves the page alone once unbound', () => {
		const page = bindPage([makeTrack('a')], '<button data-pzm-play-track="a"></button>');

		page.bind();
		pageControls?.unbind();
		element('[data-pzm-play-track]').click();

		expect(loadedTrack(page.store.getState())).toBeUndefined();
	});

	test('reports a group of tracks in the order it queued, so the first id is what starts', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b'), makeTrack('c')],
			'<button data-pzm-play-tracks="c a"></button>',
		);

		page.bind();
		element('[data-pzm-play-tracks]').click();

		expect(page.onPress).toHaveBeenCalledWith({ trackIds: ['c', 'a'], verb: 'play-tracks' });
	});

	test('a press on the group tuned in pauses and resumes in place', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b'), makeTrack('c')],
			'<button data-pzm-play-tracks="b c"></button>',
		);

		page.bind();
		page.store.getState().playTrack([makeTrack('a'), makeTrack('b')], 'b');
		page.store.getState().seek(120);
		element('[data-pzm-play-tracks]').click();

		expect(page.store.getState().isPaused).toBe(true);
		expect(page.store.getState().queue.map((track) => track.trackId)).toEqual(['a', 'b']);
		expect(loadedTrack(page.store.getState())?.trackId).toBe('b');
		expect(page.store.getState().currentTimeSeconds).toBe(120);
		expect(page.onPress).toHaveBeenCalledWith({ trackIds: ['b', 'c'], verb: 'toggle-tracks' });

		element('[data-pzm-play-tracks]').click();

		expect(page.store.getState().isPaused).toBe(false);
		expect(page.store.getState().currentTimeSeconds).toBe(120);
	});

	test('marks every group holding the loaded track while it plays', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b')],
			'<button data-pzm-play-tracks="a b" id="first"></button><button data-pzm-play-tracks="b" id="second"></button>',
		);

		page.bind();
		element('#first').click();

		expect(element('#first').dataset.pzmPlaying).toBe('');
		expect(element('#second').dataset.pzmPlaying).toBeUndefined();

		page.store.getState().next();

		expect(element('#first').dataset.pzmPlaying).toBe('');
		expect(element('#second').dataset.pzmPlaying).toBe('');

		page.store.getState().togglePaused();

		expect(element('#first').dataset.pzmPlaying).toBeUndefined();
		expect(element('#second').dataset.pzmPlaying).toBeUndefined();
	});

	test('marks the queued track and disables the button that adds it', () => {
		const page = bindPage(
			[makeTrack('a')],
			'<div data-pzm-track-id="a"><button data-pzm-queue-track="a"></button></div>',
		);

		page.bind();

		expect(element('[data-pzm-track-id="a"]').dataset.pzmQueued).toBeUndefined();
		expect(element('[data-pzm-queue-track]').hasAttribute('disabled')).toBe(false);

		element('[data-pzm-queue-track]').click();

		expect(element('[data-pzm-track-id="a"]').dataset.pzmQueued).toBe('');
		expect(element('[data-pzm-queue-track]').hasAttribute('disabled')).toBe(true);
	});
});
