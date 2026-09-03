/* eslint-disable unicorn/no-null -- a D1 row leaves these columns `null`, so the fixtures must too */
import { describe, expect, test } from 'vitest';

import type { CommentNode } from '#lib/collections/comments/comments-thread.ts';
import type { CommentValue } from '#lib/schemas/comments.ts';

import { buildThread } from '#lib/collections/comments/comments-thread.ts';

interface CommentFixture {
	id: string;
	parentId?: string;
}

function toComments(fixtures: Array<CommentFixture>): Array<CommentValue> {
	return fixtures.map(({ id, parentId }, index) => ({
		author: id,
		authorUrl: null,
		body: id,
		date: new Date(2020, 0, 1, 0, index),
		gravatarHash: null,
		id,
		parentId: parentId ?? null,
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
