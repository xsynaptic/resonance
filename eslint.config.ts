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
		getBrowserConfig([
			'packages/astro-comments/src/element/**/*',
			'src/components/**/*',
			'packages/plazmoid-core/**/*',
			'packages/plazmoid-player/**/*',
			'packages/playback-stats/**/*',
		]),
		{
			files: [
				'**/*.astro/*.{js,ts}',
				'src/components/**/*.{ts,tsx}',
				'packages/astro-comments/src/element/**/*.ts',
				'packages/plazmoid-core/src/**/*.ts',
				'packages/plazmoid-player/src/**/*.ts',
				'packages/playback-stats/src/**/*.ts',
			],
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
						message: 'Browser code goes under src/components or in a package.',
						name,
					})),
				],
			},
		},
		{
			files: ['packages/astro-comments/src/**/*.ts'],
			ignores: ['packages/astro-comments/src/element/**'],
			rules: {
				'no-restricted-globals': [
					'error',
					...browserOnlyGlobals.map((name) => ({
						message: 'Browser code goes under src/element.',
						name,
					})),
				],
			},
		},
		{
			// Dependencies run one way: the player imports core, never the reverse
			files: ['packages/plazmoid-core/**/*.ts'],
			rules: {
				'no-restricted-imports': [
					'error',
					{
						patterns: [
							{
								group: ['@xsynaptic/plazmoid-player', '@xsynaptic/plazmoid-player/*'],
								message: 'Core is headless; the player imports core, never the reverse.',
							},
							{
								group: ['@xsynaptic/sonic-ui', '@xsynaptic/sonic-ui/*'],
								message: 'Core is headless; controls belong to the player.',
							},
						],
					},
				],
			},
		},
		{
			files: [
				'verify/e2e/**/*',
				'packages/plazmoid-player/verify/e2e/**/*',
				'packages/plazmoid-player/playwright.config.ts',
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
			files: ['packages/plazmoid-player/src/elements/**/*.ts'],
			rules: {
				'unicorn/template-indent': 'off',
			},
		},
		getWebComponentConfig([
			'src/components/**/*.ts',
			'packages/astro-comments/src/element/**/*.ts',
			'packages/plazmoid-player/src/elements/**/*.ts',
		]),
		...getAstroConfig({ a11y: 'strict' }),
	],
	{
		customGlobals: { mode: 'readonly' },
	},
);
