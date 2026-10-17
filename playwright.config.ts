import { defineConfig, devices } from '@playwright/test';

import { getBaseUrl, isDev, isProd, localPort, localUrl } from '#e2e/constants.ts';

// `--ignore-lock` leaves a preview already running for this project alone, and needs the foreground
const previewServer = {
	command: `pnpm astro preview --port ${String(localPort)} --ignore-lock`,
	env: { ASTRO_PREVIEW_BACKGROUND: '0' },
	reuseExistingServer: true,
	url: localUrl,
};

export default defineConfig({
	fullyParallel: true,
	outputDir: './temp/playwright-results',
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--mute-audio'] } },
		},
		{
			grep: /@engines/,
			name: 'webkit',
			testMatch: 'player-host.spec.ts',
			use: { ...devices['Desktop Safari'] },
		},
	],
	reporter: [['list'], ['html', { open: 'never', outputFolder: './temp/playwright-report' }]],
	retries: 0,
	testDir: './tests/e2e',
	timeout: isDev ? 60_000 : 15_000,
	use: {
		baseURL: getBaseUrl(),
		trace: 'retain-on-failure',
	},
	...(isDev ? { expect: { timeout: 12_000 }, workers: 3 } : {}),
	...(isProd || isDev ? {} : { webServer: previewServer }),
});
