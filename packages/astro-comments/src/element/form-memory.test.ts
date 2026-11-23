// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';

import { createFormMemory } from '#element/form-memory.ts';

const storageKey = 'test-comment-form';

const memory = createFormMemory(storageKey);

function fail(): never {
	throw new Error('Storage is disabled');
}

// happy-dom binds a mocked Storage.prototype method onto localStorage for good, so stub the global instead
function stubThrowingStorage(): void {
	vi.stubGlobal('localStorage', { getItem: fail, removeItem: fail, setItem: fail });
}

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe('read', () => {
	test('reads back what was saved', () => {
		memory.save({ author: 'Ada', authorEmail: 'ada@example.com', authorUrl: '' });

		expect(memory.read()).toEqual({
			author: 'Ada',
			authorEmail: 'ada@example.com',
			authorUrl: '',
		});
	});

	test('an empty store reads as absent', () => {
		expect(memory.read()).toBeUndefined();
	});

	test('a truncated payload reads as absent', () => {
		localStorage.setItem(storageKey, '{"author":');

		expect(memory.read()).toBeUndefined();
	});

	test('a payload that parses to a string reads as absent', () => {
		localStorage.setItem(storageKey, '"Ada"');

		expect(memory.read()).toBeUndefined();
	});

	test('a payload that parses to null reads as absent', () => {
		localStorage.setItem(storageKey, 'null');

		expect(memory.read()).toBeUndefined();
	});

	test('storage that throws reads as absent', () => {
		stubThrowingStorage();

		expect(memory.read()).toBeUndefined();
	});
});

describe('save', () => {
	test('storage that throws is not an error for the caller', () => {
		stubThrowingStorage();

		expect(() => {
			memory.save({ author: 'Ada' });
		}).not.toThrow();
	});
});

describe('clear', () => {
	test('a cleared store reads as absent', () => {
		memory.save({ author: 'Ada' });
		memory.clear();

		expect(memory.read()).toBeUndefined();
	});

	test('storage that throws is not an error for the caller', () => {
		stubThrowingStorage();

		expect(() => {
			memory.clear();
		}).not.toThrow();
	});
});
