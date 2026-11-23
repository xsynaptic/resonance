import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import type { CommentNode } from '#render/comment-thread.ts';
import type { ApprovedComment } from '#schemas.ts';

import { buildThread } from '#render/comment-thread.ts';

interface CommentFixture {
	emailHash?: string;
	id: string;
	parentId?: string;
}

function toComments(fixtures: Array<CommentFixture>): Array<ApprovedComment> {
	return fixtures.map(({ emailHash, id, parentId }, index) => ({
		author: id,
		body: id,
		createdAt: 1_577_836_800 + index * 60,
		id,
		isOwner: false,
		thread: 'posts/entry',
		...(emailHash === undefined ? undefined : { emailHash }),
		...(parentId === undefined ? undefined : { parentId }),
	}));
}

function toShape(nodes: Array<CommentNode>): Array<[string, Array<unknown>]> {
	return nodes.map((node) => [node.id, toShape(node.replies)]);
}

// The worker accepts a reply only to an approved comment already stored, so a parent always comes first
// A parent rejected or deleted later leaves its reply pointing at nothing
const repliesToEarlierComments = fc
	.array(fc.oneof(fc.constant(undefined), fc.constant('gone'), fc.nat()), {
		maxLength: 14,
		minLength: 1,
	})
	.map((parents) =>
		parents.map((parent, index): CommentFixture => {
			const id = `comment-${String(index)}`;

			if (parent === undefined || (typeof parent === 'number' && index === 0)) return { id };
			if (parent === 'gone') return { id, parentId: 'gone' };

			return { id, parentId: `comment-${String(parent % index)}` };
		}),
	);

function toRenderedOrder(nodes: Array<CommentNode>, depth = 1): Array<[string, number]> {
	return nodes.flatMap((node) => [
		[node.id, depth] as [string, number],
		...toRenderedOrder(node.replies, depth + 1),
	]);
}

function toExpectedOrder(fixtures: Array<CommentFixture>): Array<[string, number]> {
	const ids = new Set(fixtures.map((fixture) => fixture.id));
	const repliesTo = (parentId: string | undefined) =>
		fixtures.filter((fixture) =>
			parentId === undefined
				? fixture.parentId === undefined || !ids.has(fixture.parentId)
				: fixture.parentId === parentId,
		);
	const walk = (parentId: string | undefined, depth: number): Array<[string, number]> =>
		repliesTo(parentId).flatMap((fixture) => [
			[fixture.id, Math.min(depth, 3)] as [string, number],
			...walk(fixture.id, depth + 1),
		]);

	return walk(undefined, 1);
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

	test('the depth cap and avatar size are options', () => {
		const comments = toComments([
			{ emailHash: 'a-hash', id: 'a' },
			{ id: 'b', parentId: 'a' },
			{ id: 'c', parentId: 'b' },
		]);
		const thread = buildThread(comments, { avatarSize: 32, maximumDepth: 2 });

		expect(toShape(thread)).toEqual([
			[
				'a',
				[
					['b', []],
					['c', []],
				],
			],
		]);
		expect(thread[0]?.avatar?.url).toBe('https://www.gravatar.com/avatar/a-hash?d=blank&s=32');
	});

	test.prop([repliesToEarlierComments])(
		'every comment shows once, in reading order, indented by its reply depth up to the cap',
		(fixtures) => {
			expect(toRenderedOrder(buildThread(toComments(fixtures)))).toStrictEqual(
				toExpectedOrder(fixtures),
			);
		},
	);
});
