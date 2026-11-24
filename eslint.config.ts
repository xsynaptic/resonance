import {
	getAstroConfig,
	getBrowserConfig,
	getConfig,
	getWebComponentConfig,
} from '@xsynaptic/eslint-config';
import globals from 'globals';

// Globals Node lacks; the DOM lib hides them from `astro check`, so this is what keeps them out of server code
const browserOnlyGlobals = Object.keys(globals.browser).filter(
	(name) => !Object.hasOwn(globals.nodeBuiltin, name),
);

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
				'packages/content-demo/collections/**/*',
				'**/worker-configuration.d.ts',
			],
		},
		{
			rules: {
				// Zod schema chains legitimately reach 4; depth 5+ still flagged
				'unicorn/max-nested-calls': ['error', { max: 4 }],
				// The shared config turns this off for a Remeda `R.sort` conflict the rule no longer has
				'unicorn/no-array-sort': 'error',
			},
		},
		getBrowserConfig(['src/components/**/*']),
		{
			files: ['**/*.astro/*.{js,ts}', 'src/components/**/*.{ts,tsx}'],
			ignores: ['**/*.test.{ts,tsx}'],
			rules: {
				'no-restricted-properties': [
					'error',
					...['toReversed', 'toSorted', 'toSpliced', 'with'].map((property) => ({
						message: 'Copy then mutate instead (`[...array].sort()`)',
						property,
					})),
				],
				'unicorn/no-array-reverse': 'off',
				'unicorn/no-array-sort': 'off',
			},
		},
		{
			// `src/lib/**` is build-time and server code; `no-undef` misreads type namespaces, so the browser names are listed instead
			files: ['src/lib/**/*.ts'],
			rules: {
				'no-restricted-globals': [
					'error',
					...browserOnlyGlobals.map((name) => ({
						message: 'Browser code goes under src/components.',
						name,
					})),
				],
			},
		},
		{
			files: ['verify/e2e/**/*', 'playwright.config.ts'],
			languageOptions: {
				globals: { ...globals.node, ...globals.browser },
			},
			rules: {
				'unicorn/prefer-global-this': 'off',
			},
		},
		getWebComponentConfig(['src/components/**/*.ts']),
		...getAstroConfig({ a11y: 'strict' }),
	],
	{
		customGlobals: { mode: 'readonly' },
	},
);
