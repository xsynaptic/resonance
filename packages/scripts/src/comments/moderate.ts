import type { CommentRow, CommentStatus } from '@xsynaptic/shared/comments';
import type { ChalkInstance } from 'chalk';

import { log } from '@xsynaptic/astro-scripts';
import { executeComments, queryComments, toIdLiteral } from '@xsynaptic/shared/comments';
import chalk from 'chalk';

import { pullComments } from '#comments/pull.ts';
import { readKey } from '#shared/prompt.ts';

export interface ModerateOptions {
	isLocal: boolean;
	rootPath: string;
}

export interface Tally {
	approved: number;
	rejected: number;
	skipped: number;
	spam: number;
}

type Choice = (typeof choices)[number];

interface D1Target {
	cwd: string;
	isLocal: boolean;
}

// The CLI only ever decides; nothing here puts a row back to pending
type ModeratedStatus = Exclude<CommentStatus, 'pending'>;

type PendingRow = Pick<
	CommentRow,
	| 'author'
	| 'author_email'
	| 'author_url'
	| 'body'
	| 'collection'
	| 'created_at'
	| 'entry_id'
	| 'id'
	| 'parent_id'
>;

const commentColumns =
	'id, collection, entry_id, parent_id, author, author_email, author_url, body, created_at';

const pendingQuery = `
	SELECT ${commentColumns}
	FROM comments
	WHERE status = 'pending'
	ORDER BY created_at
`;

const choices = [
	{ key: 'a', label: 'approve', status: 'approved' },
	{ key: 'r', label: 'reject', status: 'rejected' },
	{ key: 's', label: 'spam', status: 'spam' },
	{ key: 'n', label: 'skip' },
	{ key: 'A', label: 'approve all' },
	{ key: 'q', label: 'quit' },
] as const satisfies ReadonlyArray<{ key: string; label: string; status?: ModeratedStatus }>;

const statusColors: Record<ModeratedStatus, ChalkInstance> = {
	approved: chalk.green,
	rejected: chalk.red,
	spam: chalk.magenta,
};

const bodyWidth = 76;

export async function deleteComment(id: string, options: ModerateOptions): Promise<void> {
	const target = toTarget(options);
	const [comment] = await queryComments<PendingRow & Pick<CommentRow, 'status'>>(
		`SELECT ${commentColumns}, status FROM comments WHERE id = ${toIdLiteral(id)}`,
		target,
	);

	if (!comment) {
		log.warn(`No comment with id ${id}`);
		return;
	}

	printComment(comment, chalk.dim(comment.status));
	log.info(`  ${chalk.red.bold('Delete permanently?')}  ${chalk.dim('y / n')}`);

	if ((await readKey(['y', 'n'])) !== 'y') {
		log.detail('Kept');
		return;
	}

	await executeComments(`DELETE FROM comments WHERE id = ${toIdLiteral(id)}`, target);

	log.success(`Deleted ${id}`);

	if (comment.status === 'approved') await pullComments(options);
}

export async function moderateComments(options: ModerateOptions): Promise<Tally> {
	const target = toTarget(options);
	const pending = await queryComments<PendingRow>(pendingQuery, target);

	if (pending.length === 0) {
		log.success('Nothing pending');
		return toEmptyTally();
	}

	printHeader(pending.length, options.isLocal);

	const tally = await runQueue(pending, target);

	printTally(tally);
	await pullOnApproval(tally, options);

	return tally;
}

function formatDate(createdAt: number): string {
	return `${new Date(createdAt * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function printComment(comment: PendingRow, marker: string): void {
	const identity = [
		chalk.bold(comment.author),
		comment.author_email === null ? undefined : chalk.dim(`<${comment.author_email}>`),
		comment.author_url === null ? undefined : chalk.blue.underline(comment.author_url),
	].filter((part) => part !== undefined);

	const meta = [
		formatDate(comment.created_at),
		comment.id,
		comment.parent_id === null ? undefined : `reply to ${comment.parent_id}`,
	].filter((part) => part !== undefined);

	const lines = [
		'',
		`  ${marker}  ${chalk.cyan(`${comment.collection}/${comment.entry_id}`)}`,
		chalk.dim(`  ${'─'.repeat(bodyWidth)}`),
		`  ${identity.join('  ')}`,
		chalk.dim(`  ${meta.join(' · ')}`),
		'',
		...wrapBody(comment.body).map((line) => (line === '' ? '' : `  ${line}`)),
		'',
	];

	log.info(lines.join('\n'));
}

function printHeader(count: number, isLocal: boolean): void {
	const target = isLocal ? 'local' : 'remote';

	log.step(`Moderation queue · ${String(count)} pending · ${target}`);
}

function printLegend(available: ReadonlyArray<Choice>): void {
	const legend = available
		.map((choice) => `${chalk.bold.white(choice.key)} ${chalk.dim(choice.label)}`)
		.join(' '.repeat(3));

	log.info(`  ${legend}`);
}

function printResult(status: ModeratedStatus): void {
	log.info(statusColors[status](`  ✓ ${status}`));
}

function printTally(tally: Tally): void {
	log.summary([
		['Approved', tally.approved],
		['Rejected', tally.rejected],
		['Spam', tally.spam],
		['Skipped', tally.skipped],
	]);
}

// `A` decides the same row as `a` once this is the last one left
async function promptChoice({
	comment,
	isLast,
	position,
}: {
	comment: PendingRow;
	isLast: boolean;
	position: string;
}): Promise<Choice | undefined> {
	const available = isLast ? choices.filter((choice) => choice.key !== 'A') : choices;

	printComment(comment, chalk.dim(position));
	printLegend(available);

	const key = await readKey(available.map((choice) => choice.key));

	return available.find((candidate) => candidate.key === key);
}

// The site reads a snapshot, so an approval only reaches it after a pull
async function pullOnApproval(tally: Tally, options: ModerateOptions): Promise<void> {
	if (tally.approved === 0) return;

	await pullComments(options);
}

// One pass over the pending rows, stopping early on quit or on a blanket approval
async function runQueue(pending: Array<PendingRow>, target: D1Target): Promise<Tally> {
	const tally = toEmptyTally();

	for (const [index, comment] of pending.entries()) {
		const choice = await promptChoice({
			comment,
			isLast: index === pending.length - 1,
			position: `${String(index + 1)}/${String(pending.length)}`,
		});

		if (!choice || choice.key === 'q') {
			log.detail('Stopped');
			break;
		}

		if (choice.key === 'A') {
			const remaining = pending.slice(index);

			await setStatus(
				remaining.map((row) => row.id),
				'approved',
				target,
			);

			tally.approved += remaining.length;
			log.success(`Approved ${String(remaining.length)} remaining`);
			break;
		}

		if (!('status' in choice)) {
			tally.skipped += 1;
			log.info(chalk.dim('  → skipped'));
			continue;
		}

		await setStatus([comment.id], choice.status, target);

		tally[choice.status] += 1;
		printResult(choice.status);
	}

	return tally;
}

async function setStatus(
	ids: Array<string>,
	status: ModeratedStatus,
	target: D1Target,
): Promise<void> {
	const literals = ids.map((id) => toIdLiteral(id)).join(', ');

	await executeComments(
		`UPDATE comments SET status = '${status}' WHERE id IN (${literals})`,
		target,
	);
}

function toEmptyTally(): Tally {
	return { approved: 0, rejected: 0, skipped: 0, spam: 0 };
}

function toTarget(options: ModerateOptions): D1Target {
	return { cwd: options.rootPath, isLocal: options.isLocal };
}

function wrapBody(body: string): Array<string> {
	const lines: Array<string> = [];

	for (const paragraph of body.split('\n')) {
		if (paragraph.trim() === '') {
			lines.push('');
			continue;
		}

		let current = '';

		for (const word of paragraph.split(/\s+/)) {
			if (current === '') current = word;
			else if (current.length + word.length + 1 <= bodyWidth) current += ` ${word}`;
			else {
				lines.push(current);
				current = word;
			}
		}

		lines.push(current);
	}

	return lines;
}
