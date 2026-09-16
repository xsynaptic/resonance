import { vi } from 'vitest';

import type { AudioEngineCallbacks, CreateAudioEngine } from '#engine/audio-engine.ts';

export function createFakeEngine() {
	let time = 0;
	const callbacks: { current: AudioEngineCallbacks | undefined } = { current: undefined };
	const engine = {
		analyser: vi.fn(),
		canPlay: vi.fn(() => true),
		currentTime: vi.fn(() => time),
		element: document.createElement('audio'),
		load: vi.fn(() => Promise.resolve()),
		outputDelay: vi.fn(() => 0),
		pause: vi.fn(),
		play: vi.fn(() => Promise.resolve()),
		prepare: vi.fn(),
		reset: vi.fn(() => {
			time = 0;
		}),
		seek: vi.fn((seconds: number) => {
			time = seconds;
		}),
		setVolume: vi.fn(),
	};

	const createEngine: CreateAudioEngine = (given) => {
		callbacks.current = given;

		return engine;
	};

	return {
		callbacks,
		createEngine,
		engine,
		setTime: (seconds: number) => {
			time = seconds;
		},
	};
}
