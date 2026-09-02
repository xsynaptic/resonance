import chalk from 'chalk';

export interface DeployConfig {
	filesUrl: string;
	remoteAudioPath: string;
	remoteHost: string;
	remoteNginxSitesOwner: string;
	remoteNginxSitesPath: string;
	remoteServerConfigPath: string;
	siteUrl: string;
	sshKeyPath?: string;
}

const requiredEnv = {
	filesUrl: 'FILES_URL',
	remoteAudioPath: 'DEPLOY_AUDIO_PATH',
	remoteHost: 'DEPLOY_REMOTE_HOST',
	remoteNginxSitesOwner: 'DEPLOY_NGINX_SITES_OWNER',
	remoteNginxSitesPath: 'DEPLOY_NGINX_SITES_PATH',
	remoteServerConfigPath: 'DEPLOY_SERVER_CONFIG_PATH',
	siteUrl: 'DEPLOY_SITE_URL',
} as const;

const exampleEnv = [
	'  deploy/.env:',
	'    DEPLOY_REMOTE_HOST=<ssh-host-alias>',
	'    DEPLOY_SSH_KEY_PATH=/path/to/ssh/key (optional)',
	'    DEPLOY_AUDIO_PATH=/srv/resonance',
	'    DEPLOY_SERVER_CONFIG_PATH=/home/<user>/server-config',
	'    DEPLOY_NGINX_SITES_PATH=/path/to/nginx/sites-enabled',
	'    DEPLOY_NGINX_SITES_OWNER=<user>:<group>',
	'    DEPLOY_SITE_URL=https://resonance.<account>.workers.dev/',
	'  .env:',
	'    FILES_URL=https://files.djbasilisk.com/',
];

type RequiredConfig = Record<keyof typeof requiredEnv, string>;

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
	console.log(
		chalk.gray(`  nginx sites:  ${config.remoteNginxSitesPath} (${config.remoteNginxSitesOwner})`),
	);
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

	if (missing.length > 0) {
		const message = `Missing required environment variables: ${missing.join(', ')}`;

		console.error(chalk.red(message));
		console.error(chalk.gray('\nExample configuration:'));
		for (const line of exampleEnv) console.error(chalk.gray(line));

		throw new Error(message);
	}

	return values as RequiredConfig;
}
