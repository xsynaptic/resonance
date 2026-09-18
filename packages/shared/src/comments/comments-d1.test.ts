/* eslint-disable unicorn/no-null -- a D1 row leaves these columns `null`, so the fixture must too */
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
	approvedCommentSchema,
	commentRowSchema,
	queryComments,
	toIdLiteral,
} from '#comments/comments-d1.ts';

const execFile = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ execFile }));

type ExecFileCallback = (error: unknown, output: { stdout: string }) => void;

function answerWith(payload: unknown): void {
	execFile.mockImplementation(
		// eslint-disable-next-line max-params -- mirrors node:child_process `execFile`
		(_file: string, _args: Array<string>, _options: unknown, callback: ExecFileCallback) => {
			callback(undefined, { stdout: JSON.stringify(payload) });
		},
	);
}

function lastArgs(): Array<string> {
	return execFile.mock.calls.at(-1)?.[1] as Array<string>;
}

beforeEach(() => {
	execFile.mockReset();
});

describe('queryComments', () => {
	test('targets the remote database unless a local pull was asked for', async () => {
		answerWith([{ meta: { changes: 0 }, results: [] }]);

		await queryComments('SELECT 1');
		expect(lastArgs()).toContain('--remote');

		await queryComments('SELECT 1', { isLocal: true });
		expect(lastArgs()).toContain('--local');
	});
});

describe('toIdLiteral', () => {
	test('refuses anything that could close the quote', () => {
		for (const id of [`x' OR 1=1 --`, 'a b', 'a;b', '', 'a'.repeat(65)]) {
			expect(() => toIdLiteral(id)).toThrow('is not a comment id');
		}
	});
});

describe('approvedCommentSchema', () => {
	test('drops the columns that must never reach the built site', () => {
		const row = commentRowSchema.parse({
			author: 'Reader',
			author_email: 'reader@example.test',
			author_url: null,
			body: 'A comment worth keeping.',
			collection: 'mixes',
			created_at: 1_577_836_800,
			entry_id: 'voyager',
			gravatar_hash: 'a-hash',
			id: 'abc123',
			ip_hash: 'another-hash',
			parent_id: null,
			source: 'web',
			status: 'approved',
			wp_post_id: null,
		});

		const approved = approvedCommentSchema.parse(row);

		expect(Object.keys(approved)).not.toContain('author_email');
		expect(Object.keys(approved)).not.toContain('ip_hash');
	});
});
