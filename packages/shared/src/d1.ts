import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandResult<Row> {
	meta: { changes: number };
	results: Array<Row>;
}

export interface D1CommandOptions {
	cwd?: string | undefined;
	isLocal?: boolean | undefined;
}

export async function runD1Command<Row>(
	databaseName: string,
	sql: string,
	options: D1CommandOptions,
): Promise<Array<CommandResult<Row>>> {
	const { cwd, isLocal = false } = options;

	const { stdout } = await execFileAsync(
		'pnpm',
		[
			'exec',
			'wrangler',
			'd1',
			'execute',
			databaseName,
			isLocal ? '--local' : '--remote',
			'--json',
			'--command',
			sql,
		],
		// The corpus grows without bound; Node's 1 MB default would truncate it into a parse failure
		{ cwd, maxBuffer: Infinity },
	);

	return JSON.parse(stdout) as Array<CommandResult<Row>>;
}
