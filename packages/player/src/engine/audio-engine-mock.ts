import { vi } from 'vitest';

import type { AudioEngineCallbacks, CreateAudioEngine } from '#engine/audio-engine.ts';

export function createMockEngine() {
	let time = 0;
	const callbacks: { current: AudioEngineCallbacks | undefined } = { current: undefined };
	const engine = {
		canPlay: vi.fn(() => true),
		currentTime: vi.fn(() => time),
		element: document.createElement('audio'),
		load: vi.fn(() => Promise.resolve()),
		pause: vi.fn(),
		play: vi.fn(() => Promise.resolve()),
		reset: vi.fn(() => {
			time = 0;
		}),
		seek: vi.fn((seconds: number) => {
			time = seconds;
		}),
		setMuted: vi.fn(),
		setVolume: vi.fn(),
		silence: vi.fn(() => {
			time = 0;
		}),
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
