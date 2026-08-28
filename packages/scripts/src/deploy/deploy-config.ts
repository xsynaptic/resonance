import chalk from 'chalk';

export interface DeployConfig {
	filesUrl: string;
	remoteAudioPath: string;
	remoteHost: string;
	remoteServerConfigPath: string;
	siteUrl: string;
	sshKeyPath?: string;
}

const REQUIRED_ENV = {
	filesUrl: 'FILES_URL',
	remoteAudioPath: 'DEPLOY_AUDIO_PATH',
	remoteHost: 'DEPLOY_REMOTE_HOST',
	remoteServerConfigPath: 'DEPLOY_SERVER_CONFIG_PATH',
	siteUrl: 'DEPLOY_SITE_URL',
} as const;

const EXAMPLE_ENV = [
	'  deploy/.env:',
	'    DEPLOY_REMOTE_HOST=deploy@files.djbasilisk.com',
	'    DEPLOY_SSH_KEY_PATH=/path/to/ssh/key (optional)',
	'    DEPLOY_AUDIO_PATH=<audio-path>',
	'    DEPLOY_SERVER_CONFIG_PATH=<staging-path>',
	'    DEPLOY_SITE_URL=https://djbasilisk.<account>.workers.dev/',
	'  .env:',
	'    FILES_URL=https://files.djbasilisk.com/',
];

type RequiredConfig = Record<keyof typeof REQUIRED_ENV, string>;

export function loadDeployConfig(): DeployConfig {
	const sshKeyPath = process.env.DEPLOY_SSH_KEY_PATH;

	return { ...readRequiredEnv(), ...(sshKeyPath ? { sshKeyPath } : {}) };
}

export function printDeployConfig(config: DeployConfig): void {
	console.log(chalk.blue('Deploy configuration:'));
	console.log(chalk.gray(`  Remote host:  ${config.remoteHost}`));
	console.log(chalk.gray(`  SSH key:      ${config.sshKeyPath ?? '(agent/keychain)'}`));
	console.log(chalk.gray(`  Audio path:   ${config.remoteAudioPath}`));
	console.log(chalk.gray(`  Config path:  ${config.remoteServerConfigPath}`));
	console.log(chalk.gray(`  Site URL:     ${config.siteUrl}`));
	console.log(chalk.gray(`  Files URL:    ${config.filesUrl}`));
	console.log('');
}

// Reports every absent variable at once rather than failing on the first
function readRequiredEnv(): RequiredConfig {
	const entries = Object.entries(REQUIRED_ENV) as Array<[keyof typeof REQUIRED_ENV, string]>;
	const values: Partial<RequiredConfig> = {};
	const missing: Array<string> = [];

	for (const [key, name] of entries) {
		const value = process.env[name];

		if (value) values[key] = value;
		else missing.push(name);
	}

	if (missing.length > 0) {
		const message = `Missing required environment variables: ${missing.join(', ')}`;

		console.error(chalk.red(message));
		console.error(chalk.gray('\nExample configuration:'));
		for (const line of EXAMPLE_ENV) console.error(chalk.gray(line));

		throw new Error(message);
	}

	return values as RequiredConfig;
}
