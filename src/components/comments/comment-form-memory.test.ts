// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	clearStoredDetails,
	readStoredDetails,
	saveStoredDetails,
} from '#components/comments/comment-form-memory.ts';
import { commentFormStorageKey as storageKey } from '#components/main/main-storage-keys.ts';

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

describe('readStoredDetails', () => {
	test('reads back what was saved', () => {
		saveStoredDetails({ author: 'Ada', authorEmail: 'ada@example.com', authorUrl: '' });

		expect(readStoredDetails()).toEqual({
			author: 'Ada',
			authorEmail: 'ada@example.com',
			authorUrl: '',
		});
	});

	test('an empty store reads as absent', () => {
		expect(readStoredDetails()).toBeUndefined();
	});

	test('a truncated payload reads as absent', () => {
		localStorage.setItem(storageKey, '{"author":');

		expect(readStoredDetails()).toBeUndefined();
	});

	test('a payload that parses to a string reads as absent', () => {
		localStorage.setItem(storageKey, '"Ada"');

		expect(readStoredDetails()).toBeUndefined();
	});

	test('a payload that parses to null reads as absent', () => {
		localStorage.setItem(storageKey, 'null');

		expect(readStoredDetails()).toBeUndefined();
	});

	test('storage that throws reads as absent', () => {
		stubThrowingStorage();

		expect(readStoredDetails()).toBeUndefined();
	});
});

describe('saveStoredDetails', () => {
	test('storage that throws is not an error for the caller', () => {
		stubThrowingStorage();

		expect(() => {
			saveStoredDetails({ author: 'Ada' });
		}).not.toThrow();
	});
});

describe('clearStoredDetails', () => {
	test('a cleared store reads as absent', () => {
		saveStoredDetails({ author: 'Ada' });
		clearStoredDetails();

		expect(readStoredDetails()).toBeUndefined();
	});

	test('storage that throws is not an error for the caller', () => {
		stubThrowingStorage();

		expect(() => {
			clearStoredDetails();
		}).not.toThrow();
	});
});
