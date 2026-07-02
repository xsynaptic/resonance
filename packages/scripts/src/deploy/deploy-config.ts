import chalk from 'chalk';

export interface DeployConfig {
	filesUrl: string;
	remoteAudioPath: string;
	remoteHost: string;
	remoteServerConfigPath: string;
	siteUrl: string;
	sshKeyPath?: string;
}

const EXAMPLE_ENV = [
	'  DEPLOY_REMOTE_HOST=deploy@files.djbasilisk.com',
	'  DEPLOY_SSH_KEY_PATH=/path/to/ssh/key (optional)',
	'  DEPLOY_AUDIO_PATH=<audio-path>',
	'  DEPLOY_SERVER_CONFIG_PATH=<staging-path>',
	'  DEPLOY_SITE_URL=https://djbasilisk.<account>.workers.dev/',
	'  DEPLOY_FILES_URL=https://files.djbasilisk.com/',
];

export function loadDeployConfig(): DeployConfig {
	const remoteHost = process.env.DEPLOY_REMOTE_HOST;
	const sshKeyPath = process.env.DEPLOY_SSH_KEY_PATH;
	const remoteAudioPath = process.env.DEPLOY_AUDIO_PATH;
	const remoteServerConfigPath = process.env.DEPLOY_SERVER_CONFIG_PATH;
	const siteUrl = process.env.DEPLOY_SITE_URL;
	const filesUrl = process.env.DEPLOY_FILES_URL;

	const missing: Array<string> = [];

	if (!remoteHost) missing.push('DEPLOY_REMOTE_HOST');
	if (!remoteAudioPath) missing.push('DEPLOY_AUDIO_PATH');
	if (!remoteServerConfigPath) missing.push('DEPLOY_SERVER_CONFIG_PATH');
	if (!siteUrl) missing.push('DEPLOY_SITE_URL');
	if (!filesUrl) missing.push('DEPLOY_FILES_URL');

	if (!remoteHost || !remoteAudioPath || !remoteServerConfigPath || !siteUrl || !filesUrl) {
		console.error(chalk.red(`Missing required environment variables: ${missing.join(', ')}`));
		console.error(chalk.gray('\nExample deploy/.env configuration:'));
		for (const line of EXAMPLE_ENV) console.error(chalk.gray(line));
		throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
	}

	return {
		filesUrl,
		remoteAudioPath,
		remoteHost,
		remoteServerConfigPath,
		siteUrl,
		...(sshKeyPath ? { sshKeyPath } : {}),
	};
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
