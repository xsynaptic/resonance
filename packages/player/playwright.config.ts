import { defineConfig, devices } from '@playwright/test';

import { fixtureOrigin, pagePort } from '#e2e/constants.ts';

const chromiumSilent = { launchOptions: { args: ['--mute-audio'] } };
const firefoxSilent = { launchOptions: { firefoxUserPrefs: { 'media.volume_scale': '0.0' } } };

export default defineConfig({
	fullyParallel: true,
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...chromiumSilent } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'], ...firefoxSilent } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } },
		{ name: 'mobile-webkit', use: { ...devices['iPhone 17'] } },
	],
	reporter: [['list'], ['html', { open: 'never' }]],
	retries: 0,
	testDir: './e2e',
	use: {
		baseURL: `http://localhost:${String(pagePort)}`,
		trace: 'retain-on-failure',
	},
	webServer: [
		{
			command: `vite e2e/page --port ${String(pagePort)} --strictPort`,
			reuseExistingServer: true,
			url: `http://localhost:${String(pagePort)}`,
		},
		{
			command: 'node e2e/fixture-server.ts',
			reuseExistingServer: true,
			url: `${fixtureOrigin}/log`,
		},
	],
});
