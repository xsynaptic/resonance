import { styleText } from 'node:util';

import type { CommentModerationStore, CommentStatus, StoredComment } from '#store.ts';

import { printComment, printLegend, readKey } from '#cli/terminal.ts';

export interface ModerationTally {
	approved: number;
	rejected: number;
	skipped: number;
	spam: number;
}

type Decision = Exclude<CommentStatus, 'pending'>;

type Choice = (typeof choices)[number];

const choices = [
	{ key: 'a', label: 'approve', status: 'approved' },
	{ key: 'r', label: 'reject', status: 'rejected' },
	{ key: 's', label: 'spam', status: 'spam' },
	{ key: 'n', label: 'skip' },
	{ key: 'A', label: 'approve all' },
	{ key: 'q', label: 'quit' },
] as const satisfies ReadonlyArray<{ key: string; label: string; status?: Decision }>;

const decisionColours = { approved: 'green', rejected: 'red', spam: 'magenta' } as const;

// The form has no login, so a matching email only marks a candidate; approving it is what vouches
export async function runModerationQueue(
	store: CommentModerationStore,
	ownerEmails: ReadonlyArray<string>,
): Promise<ModerationTally> {
	const pending = await store.listPending();
	const owners = new Set(ownerEmails.map((email) => normalizeEmail(email)));
	const isOwnerCandidate = (comment: StoredComment) =>
		comment.authorEmail !== undefined && owners.has(normalizeEmail(comment.authorEmail));
	const tally: ModerationTally = { approved: 0, rejected: 0, skipped: 0, spam: 0 };

	if (pending.length === 0) console.log(styleText('green', '✓ Nothing pending'));

	for (const [index, comment] of pending.entries()) {
		const isCandidate = isOwnerCandidate(comment);
		const choice = await promptChoice(comment, {
			isLast: index === pending.length - 1,
			marker: `${String(index + 1)}/${String(pending.length)}${isCandidate ? styleText('yellow', ' Owner') : ''}`,
		});

		if (!choice || choice.key === 'q') break;

		if (choice.key === 'A') {
			const remaining = pending.slice(index);
			const approvable = remaining.filter((candidate) => !isOwnerCandidate(candidate));

			await approveAll(store, approvable, tally);
			tally.skipped += remaining.length - approvable.length;
			break;
		}

		await decide(store, { choice, comment, isCandidate, tally });
	}

	return tally;
}

async function approveAll(
	store: CommentModerationStore,
	approvable: Array<StoredComment>,
	tally: ModerationTally,
): Promise<void> {
	await store.setStatus(
		approvable.map((comment) => comment.id),
		'approved',
	);

	tally.approved += approvable.length;
	console.log(styleText('green', `  ✓ approved ${String(approvable.length)} remaining`));
}

async function decide(
	store: CommentModerationStore,
	{
		choice,
		comment,
		isCandidate,
		tally,
	}: { choice: Choice; comment: StoredComment; isCandidate: boolean; tally: ModerationTally },
): Promise<void> {
	if (!('status' in choice)) {
		tally.skipped += 1;
		return;
	}

	// Owner first, so a failure between the writes leaves the comment unpublished rather than unbadged
	if (isCandidate && choice.status === 'approved') await store.setOwner([comment.id], true);

	await store.setStatus([comment.id], choice.status);

	tally[choice.status] += 1;
	console.log(styleText(decisionColours[choice.status], `  ✓ ${choice.status}`));
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

// `A` decides the same row as `a` once this is the last one left
async function promptChoice(
	comment: StoredComment,
	{ isLast, marker }: { isLast: boolean; marker: string },
): Promise<Choice | undefined> {
	const available = isLast ? choices.filter((choice) => choice.key !== 'A') : choices;

	printComment(comment, styleText('dim', marker));
	printLegend(available);

	const key = await readKey(available.map((choice) => choice.key));

	return available.find((choice) => choice.key === key);
}
