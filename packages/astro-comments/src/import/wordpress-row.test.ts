import { describe, expect, test } from 'vitest';

import type { WordPressCommentRow } from '#import/wordpress-row.ts';

import { toImportedComment } from '#import/wordpress-row.ts';

// SHA-256 of `reader@example.test`, the same digest the submission handler stores
const emailHash = '2cecb651356e138bd83a5215c4d7c5a3ebfb923a0c316de1b218797417911c5e';

function row(overrides: Partial<WordPressCommentRow> = {}): WordPressCommentRow {
	return {
		comment_approved: '1',
		comment_author: 'Reader',
		comment_author_email: '',
		comment_author_url: '',
		comment_content: 'A <b>fine</b> mix.',
		comment_date_gmt: '2012-06-08 23:01:02',
		comment_ID: 792,
		comment_parent: 0,
		...overrides,
	};
}

describe('toImportedComment', () => {
	test('keys the row by its WordPress id, in UTC epoch seconds, with the body converted', async () => {
		await expect(
			toImportedComment(row(), { isOwner: false, thread: 'mixes/voyager' }),
		).resolves.toEqual({
			author: 'Reader',
			body: 'A **fine** mix.',
			createdAt: 1_339_196_462,
			id: 'wp-792',
			isOwner: false,
			source: 'wordpress',
			status: 'approved',
			thread: 'mixes/voyager',
		});
	});

	test('links a reply to its parent and hashes the trimmed, lowercased email', async () => {
		const comment = await toImportedComment(
			row({
				comment_author_email: ' Reader@Example.test ',
				comment_author_url: 'https://example.test/',
				comment_parent: '791',
			}),
			{ isOwner: true, thread: 'mixes/voyager' },
		);

		expect(comment).toMatchObject({
			authorEmail: 'reader@example.test',
			authorUrl: 'https://example.test/',
			emailHash,
			isOwner: true,
			parentId: 'wp-791',
		});
	});

	test('maps every WordPress approval state to one of the four statuses', async () => {
		const statuses = await Promise.all(
			['0', '1', 'spam', 'trash', 'post-trashed'].map(async (approval) => {
				const comment = await toImportedComment(row({ comment_approved: approval }), {
					isOwner: false,
					thread: 'mixes/voyager',
				});

				return comment.status;
			}),
		);

		expect(statuses).toEqual(['pending', 'approved', 'spam', 'rejected', 'rejected']);
	});

	test('refuses an unknown status and a missing GMT date', async () => {
		const options = { isOwner: false, thread: 'mixes/voyager' };

		await expect(toImportedComment(row({ comment_approved: 'hold' }), options)).rejects.toThrow(
			'unknown status',
		);
		await expect(
			toImportedComment(row({ comment_date_gmt: '0000-00-00 00:00:00' }), options),
		).rejects.toThrow('no GMT date');
	});
});
