import type { CommentRow, CommentStatus } from '@xsynaptic/shared/comments';
import type { ChalkInstance } from 'chalk';

import { executeComments, queryComments, toIdLiteral } from '@xsynaptic/shared/comments';
import chalk from 'chalk';
import { once } from 'node:events';

import { pullComments } from './pull.js';

export interface ModerateOptions {
	isLocal: boolean;
	rootPath: string;
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

interface Tally {
	approved: number;
	rejected: number;
	skipped: number;
	spam: number;
}

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

// Raw mode swallows SIGINT, so ctrl-c arrives as a keystroke
const interrupt = '\u{3}';

const bodyWidth = 76;

export async function deleteComment(id: string, options: ModerateOptions): Promise<void> {
	const target = toTarget(options);
	const [comment] = await queryComments<PendingRow & Pick<CommentRow, 'status'>>(
		`SELECT ${commentColumns}, status FROM comments WHERE id = ${toIdLiteral(id)}`,
		target,
	);

	if (!comment) {
		console.log(chalk.yellow(`\n  No comment with id ${id}.\n`));
		return;
	}

	printComment(comment, chalk.dim(comment.status));
	console.log(`  ${chalk.red.bold('Delete permanently?')}  ${chalk.dim('y / n')}`);

	if ((await readKey(['y', 'n'])) !== 'y') {
		console.log(chalk.dim('\n  Kept.\n'));
		return;
	}

	await executeComments(`DELETE FROM comments WHERE id = ${toIdLiteral(id)}`, target);

	console.log(chalk.red(`\n  ✗ deleted ${id}`));
	console.log('');

	if (comment.status === 'approved') await pullComments(options);
}

export async function moderateComments(options: ModerateOptions): Promise<void> {
	const target = toTarget(options);
	const pending = await queryComments<PendingRow>(pendingQuery, target);

	if (pending.length === 0) {
		console.log(chalk.green('\n  Nothing pending.\n'));
		return;
	}

	printHeader(pending.length, options.isLocal);

	const tally: Tally = { approved: 0, rejected: 0, skipped: 0, spam: 0 };

	for (const [index, comment] of pending.entries()) {
		// `A` decides the same row as `a` once this is the last one left
		const available =
			index < pending.length - 1 ? choices : choices.filter((choice) => choice.key !== 'A');

		printComment(comment, chalk.dim(`${String(index + 1)}/${String(pending.length)}`));
		printLegend(available);

		const key = await readKey(available.map((choice) => choice.key));
		const choice = available.find((candidate) => candidate.key === key);

		if (!choice || choice.key === 'q') {
			console.log(chalk.dim('\n  Stopped.'));
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
			console.log(chalk.green(`\n  ✓ approved ${String(remaining.length)} remaining`));
			break;
		}

		if (!('status' in choice)) {
			tally.skipped += 1;
			console.log(chalk.dim('\n  → skipped'));
			continue;
		}

		await setStatus([comment.id], choice.status, target);

		tally[choice.status] += 1;
		printResult(choice.status);
	}

	printTally(tally);
	await pullOnApproval(tally, options);
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

	console.log(`\n  ${marker}  ${chalk.cyan(`${comment.collection}/${comment.entry_id}`)}`);
	console.log(chalk.dim(`  ${'─'.repeat(bodyWidth)}`));
	console.log(`  ${identity.join('  ')}`);
	console.log(chalk.dim(`  ${meta.join(' · ')}`));
	console.log('');

	for (const line of wrapBody(comment.body)) {
		console.log(line === '' ? '' : `  ${line}`);
	}

	console.log('');
}

function printHeader(count: number, isLocal: boolean): void {
	const target = isLocal ? 'local' : 'remote';

	console.log(
		`\n  ${chalk.bold.cyan('Moderation queue')} ${chalk.dim(`· ${String(count)} pending · ${target}`)}`,
	);
}

function printLegend(available: ReadonlyArray<Choice>): void {
	const legend = available
		.map((choice) => `${chalk.bold.white(choice.key)} ${chalk.dim(choice.label)}`)
		.join(' '.repeat(3));

	console.log(`  ${legend}`);
}

function printResult(status: ModeratedStatus): void {
	console.log(statusColors[status](`\n  ✓ ${status}`));
}

function printTally(tally: Tally): void {
	const parts = [
		chalk.green(`${String(tally.approved)} approved`),
		chalk.red(`${String(tally.rejected)} rejected`),
		chalk.magenta(`${String(tally.spam)} spam`),
		chalk.dim(`${String(tally.skipped)} skipped`),
	];

	console.log(`\n  ${chalk.bold('Done')} ${chalk.dim('·')} ${parts.join(chalk.dim(' · '))}\n`);
}

// The site reads a snapshot, so an approval only reaches it after a pull
async function pullOnApproval(tally: Tally, options: ModerateOptions): Promise<void> {
	if (tally.approved === 0) return;

	await pullComments(options);
}

// Resolves undefined on ctrl-c, which every caller reads as quit
async function readKey(keys: ReadonlyArray<string>): Promise<string | undefined> {
	const { stdin } = process;

	if (!stdin.isTTY) throw new Error('Moderation needs an interactive terminal');

	stdin.setRawMode(true);
	stdin.resume();
	stdin.setEncoding('utf8');

	try {
		for (;;) {
			const [key] = (await once(stdin, 'data')) as [string];

			if (key === interrupt) return undefined;
			if (keys.includes(key)) return key;
		}
	} finally {
		stdin.setRawMode(false);
		stdin.pause();
	}
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
