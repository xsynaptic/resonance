// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	clearStoredDetails,
	readStoredDetails,
	saveStoredDetails,
} from '#components/comments/comment-form-memory.ts';

const storageKey = 'comment-form-details';

afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
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
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('Storage is disabled');
		});

		expect(readStoredDetails()).toBeUndefined();
	});
});

describe('saveStoredDetails', () => {
	test('storage that throws is not an error for the caller', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('Storage is full');
		});

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
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw new Error('Storage is disabled');
		});

		expect(() => {
			clearStoredDetails();
		}).not.toThrow();
	});
});
