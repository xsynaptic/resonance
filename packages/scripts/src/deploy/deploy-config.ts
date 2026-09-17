import chalk from 'chalk';

export interface DeployConfig {
	filesUrl: string;
	remoteHost: string;
	siteUrl: string;
}

// Only what varies; the remote paths are fixed and live beside the code that uses them
const requiredEnv = {
	filesUrl: 'FILES_URL',
	remoteHost: 'DEPLOY_REMOTE_HOST',
	siteUrl: 'DEPLOY_SITE_URL',
} as const;

// Every wrangler call reads these; without them it falls back to OAuth, whose refresh is not scriptable
const requiredAuthEnv = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'] as const;

const exampleEnv = [
	'  deploy/.env:',
	'    CLOUDFLARE_ACCOUNT_ID=<account-id>',
	'    CLOUDFLARE_API_TOKEN=<token with Workers Scripts:Edit, Workers Routes:Edit, D1:Edit>',
	'    DEPLOY_REMOTE_HOST=<ssh-host-alias>',
	'    DEPLOY_SITE_URL=https://resonance.<account>.workers.dev/',
	'  .env:',
	'    FILES_URL=https://files.djbasilisk.com/',
];

type RequiredConfig = Record<keyof typeof requiredEnv, string>;

export function loadDeployConfig(): DeployConfig {
	return readRequiredEnv();
}

export function printDeployConfig(config: DeployConfig): void {
	console.log(chalk.blue('Deploy configuration:'));
	console.log(chalk.gray(`  Remote host:  ${config.remoteHost}`));
	console.log(chalk.gray(`  Site URL:     ${config.siteUrl}`));
	console.log(chalk.gray(`  Files URL:    ${config.filesUrl}`));
	console.log('');
}

// Reports every absent variable at once rather than failing on the first
function readRequiredEnv(): RequiredConfig {
	const entries = Object.entries(requiredEnv) as Array<[keyof typeof requiredEnv, string]>;
	const values: Partial<RequiredConfig> = {};
	const missing: Array<string> = [];

	for (const [key, name] of entries) {
		const value = process.env[name];

		if (value) values[key] = value;
		else missing.push(name);
	}

	// Checked here so a missing token costs a second rather than surfacing minutes in, mid-pipeline
	for (const name of requiredAuthEnv) {
		const value = process.env[name];

		if (!value) missing.push(name);
	}

	if (missing.length > 0) {
		const message = `Missing required environment variables: ${missing.join(', ')}`;

		console.error(chalk.red(message));
		console.error(chalk.gray('\nExample configuration:'));
		for (const line of exampleEnv) console.error(chalk.gray(line));

		throw new Error(message);
	}

	return values as RequiredConfig;
}
