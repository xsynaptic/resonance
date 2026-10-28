import { createProgress, formatError, log, UserError, withStep } from '@xsynaptic/astro-scripts';
import pLimit from 'p-limit';

// An incremental derivation step: the caller decides what is already current, this runs the rest
export interface BatchStep<Job> {
	concurrency: number;
	// The line a dry run prints for one job, naming the work rather than repeating the noun
	describe: (job: Job) => string;
	dryRun: boolean;
	// Plural and capitalized; opens the summary lines
	label: string;
	// Singular; names one unit of work in a failure
	noun: string;
	pending: ReadonlyArray<Job>;
	// Runs only once there is work to do, so an idle machine never fails over a missing binary
	prepare?: () => Promise<void>;
	// Answers the name of what landed, printed against the job's place in the run
	run: (job: Job) => Promise<string>;
	skipped: number;
	verb: { infinitive: string; past: string };
}

export async function runBatchStep<Job>({
	concurrency,
	describe,
	dryRun,
	label,
	noun,
	pending,
	prepare,
	run,
	skipped,
	verb,
}: BatchStep<Job>): Promise<void> {
	const text = `${label}: ${String(pending.length + skipped)} total, ${String(skipped)} up to date, ${String(pending.length)} to ${verb.infinitive}`;

	await withStep(text, async () => {
		if (dryRun) {
			for (const job of pending) log.detail(`Dry run: ${describe(job)}`);
			return;
		}

		await prepare?.();

		const limit = pLimit(concurrency);
		const progress = createProgress({ label, total: pending.length });

		const results = await Promise.allSettled(
			pending.map((job) =>
				limit(async () => {
					const name = await run(job);

					log.detail(name);
					progress.tick();
				}),
			),
		);

		const failures = results.filter(
			(result): result is PromiseRejectedResult => result.status === 'rejected',
		);

		if (failures.length > 0) {
			progress.fail();
			for (const failure of failures) log.error(`${noun} failed: ${formatError(failure.reason)}`);
			throw new UserError(`${String(failures.length)} ${noun}(s) failed to ${verb.infinitive}`);
		}

		progress.succeed(
			`${label} complete: ${String(pending.length)} ${verb.past}, ${String(skipped)} unchanged`,
		);
	});
}
