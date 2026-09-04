/* eslint-disable unicorn/no-null -- a D1 row leaves these columns `null`, so the fixtures must too */
import type { ApprovedComment } from '@xsynaptic/shared/comments';

import { describe, expect, test } from 'vitest';

import type { CommentNode } from '#lib/comments/comments-thread.ts';

import { buildThread } from '#lib/comments/comments-thread.ts';

interface CommentFixture {
	id: string;
	parentId?: string;
}

function toComments(fixtures: Array<CommentFixture>): Array<ApprovedComment> {
	return fixtures.map(({ id, parentId }, index) => ({
		author: id,
		author_url: null,
		body: id,
		collection: 'posts',
		created_at: 1_577_836_800 + index * 60,
		entry_id: 'entry',
		gravatar_hash: null,
		id,
		parent_id: parentId ?? null,
	}));
}

function toShape(nodes: Array<CommentNode>): Array<[string, Array<unknown>]> {
	return nodes.map((node) => [node.id, toShape(node.replies)]);
}

describe('buildThread', () => {
	test('a reply nests under its parent', () => {
		const thread = buildThread(toComments([{ id: 'a' }, { id: 'b', parentId: 'a' }]));

		expect(toShape(thread)).toEqual([['a', [['b', []]]]]);
	});

	test('a reply to a missing parent becomes a root', () => {
		const thread = buildThread(toComments([{ id: 'a' }, { id: 'b', parentId: 'gone' }]));

		expect(toShape(thread)).toEqual([
			['a', []],
			['b', []],
		]);
	});

	test('nesting stops at three levels', () => {
		const thread = buildThread(
			toComments([
				{ id: 'a' },
				{ id: 'b', parentId: 'a' },
				{ id: 'c', parentId: 'b' },
				{ id: 'd', parentId: 'c' },
				{ id: 'e', parentId: 'd' },
			]),
		);

		expect(toShape(thread)).toEqual([
			[
				'a',
				[
					[
						'b',
						[
							['c', []],
							['d', []],
							['e', []],
						],
					],
				],
			],
		]);
	});

	test('a capped reply keeps its place behind the comment it answers', () => {
		const thread = buildThread(
			toComments([
				{ id: 'a' },
				{ id: 'b', parentId: 'a' },
				{ id: 'c', parentId: 'b' },
				{ id: 'd', parentId: 'b' },
				{ id: 'e', parentId: 'c' },
			]),
		);

		expect(toShape(thread)).toEqual([
			[
				'a',
				[
					[
						'b',
						[
							['c', []],
							['e', []],
							['d', []],
						],
					],
				],
			],
		]);
	});
});
