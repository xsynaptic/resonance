import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { CommentModerationStore, StoredComment } from '#store.ts';

import { runModerationQueue } from '#cli/moderation-queue.ts';

const keys = vi.hoisted<Array<string>>(() => []);

vi.mock('#cli/terminal.ts', () => ({
	printComment: vi.fn(),
	printLegend: vi.fn(),
	readKey: () => Promise.resolve(keys.shift()),
}));

const owner = 'owner@example.test';

let comments: Array<StoredComment>;

beforeEach(() => {
	vi.spyOn(console, 'log').mockImplementation(vi.fn());
	comments = [];
});

function seed(rows: Array<{ email?: string; id: string }>): void {
	comments = rows.map(({ email, id }, index) => ({
		author: 'Reader',
		body: 'A comment.',
		createdAt: index,
		id,
		isOwner: false,
		source: 'web',
		status: 'pending',
		thread: 'mixes/voyager',
		...(email === undefined ? undefined : { authorEmail: email }),
	}));
}

function update(ids: Array<string>, change: Partial<StoredComment>): Promise<number> {
	const matched = comments.filter((comment) => ids.includes(comment.id));

	for (const comment of matched) Object.assign(comment, change);

	return Promise.resolve(matched.length);
}

function createStore(): CommentModerationStore {
	return {
		deleteComment: () => Promise.resolve(undefined),
		getComment: () => Promise.resolve(undefined),
		listApproved: () => Promise.resolve([]),
		listPending: () => Promise.resolve(comments.filter((comment) => comment.status === 'pending')),
		setOwner: (ids, isOwner) => update(ids, { isOwner }),
		setStatus: (ids, status) => update(ids, { status }),
	};
}

function stateOf(id: string) {
	const comment = comments.find((candidate) => candidate.id === id);

	return { isOwner: comment?.isOwner, status: comment?.status };
}

describe('the moderation queue', () => {
	test("marks an approved comment as the Owner's only when its email is an owner's", async () => {
		seed([
			{ email: ' Owner@Example.test ', id: 'mine' },
			{ email: 'reader@example.test', id: 'theirs' },
		]);
		keys.push('a', 'a');

		await runModerationQueue(createStore(), [owner]);

		expect(stateOf('mine')).toEqual({ isOwner: true, status: 'approved' });
		expect(stateOf('theirs')).toEqual({ isOwner: false, status: 'approved' });
	});

	test("never marks a rejected owner-email comment as the Owner's", async () => {
		seed([{ email: owner, id: 'impostor' }]);
		keys.push('r');

		await runModerationQueue(createStore(), [owner]);

		expect(stateOf('impostor')).toEqual({ isOwner: false, status: 'rejected' });
	});

	test('leaves owner candidates pending when approving all', async () => {
		seed([{ id: 'first' }, { email: owner, id: 'candidate' }, { id: 'last' }]);
		keys.push('A');

		const tally = await runModerationQueue(createStore(), [owner]);

		expect(stateOf('first').status).toBe('approved');
		expect(stateOf('last').status).toBe('approved');
		expect(stateOf('candidate')).toEqual({ isOwner: false, status: 'pending' });
		expect(tally).toEqual({ approved: 2, rejected: 0, skipped: 1, spam: 0 });
	});
});
