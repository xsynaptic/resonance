import { getAstroConfig, getConfig, getWebComponentConfig } from '@xsynaptic/eslint-config';
import globals from 'globals';

export default getConfig(
	[
		{
			ignores: [
				'node_modules/**/*',
				'.claude/**/*',
				'**/.astro/**/*',
				'**/.cache/**/*',
				'**/.wrangler/**/*',
				'**/dist/**/*',
				'**/playwright-report/**/*',
				'**/test-results/**/*',
				'packages/content/{archive,collections}/**/*',
				'**/worker-configuration.d.ts',
			],
		},
		{
			rules: {
				complexity: ['warn', { max: 8, variant: 'modified' }],
				// The expanded form reads more clearly than ??=, ||=, and &&=
				'logical-assignment-operators': ['error', 'never'],
				'max-depth': ['warn', 3],
				'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
				'max-params': ['warn', 3],
				'max-statements': ['warn', 25],
				// Intentional compounds such as schema.org's WebSite type
				'unicorn/consistent-compound-words': 'off',
				// Zod schema chains legitimately reach 4; depth 5+ still flagged
				'unicorn/max-nested-calls': ['error', { max: 4 }],
				// Conflicts with Remeda's sort function
				'unicorn/no-array-sort': 'off',
			},
		},
		{
			// A describe block's length is not a complexity signal
			files: ['**/*.test.{ts,tsx}'],
			rules: {
				'max-lines-per-function': 'off',
				'max-statements': 'off',
			},
		},
		{
			// These files run in the browser and might need browser globals
			files: ['src/components/**/*', 'packages/player/**/*', 'packages/playback-stats/**/*'],
			languageOptions: {
				globals: {
					...Object.fromEntries(Object.keys(globals.node).map((key) => [key, 'off'])),
					...globals.browser,
				},
			},
			rules: {
				'unicorn/prefer-global-this': 'off',
			},
		},
		{
			files: [
				'tests/e2e/**/*',
				'packages/player/e2e/**/*',
				'packages/player/playwright.config.ts',
				'playwright.config.ts',
			],
			languageOptions: {
				globals: { ...globals.node, ...globals.browser },
			},
			rules: {
				'unicorn/prefer-global-this': 'off',
			},
		},
		{
			// Prettier formats the `/* HTML */` literals these elements render from; the rule reindents what it just laid out
			files: ['packages/player/src/elements/**/*.ts'],
			rules: {
				'unicorn/template-indent': 'off',
			},
		},
		getWebComponentConfig(['src/components/**/*.ts', 'packages/player/src/elements/**/*.ts']),
		...getAstroConfig({ a11y: 'strict' }),
	],
	{
		customGlobals: { mode: 'readonly' },
	},
);
