import type { ESLint } from 'eslint';

import { getAstroConfig, getConfig, getWebComponentConfig } from '@xsynaptic/eslint-config';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default getConfig(
	[
		{
			ignores: [
				'node_modules/**/*',
				'**/.astro/**/*',
				'**/.cache/**/*',
				'**/.wrangler/**/*',
				'**/dist/**/*',
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
				// Intentional compounds such as schema.org's WebSite type
				'unicorn/consistent-compound-words': 'off',
				// Zod schema chains legitimately reach 4; depth 5+ still flagged
				'unicorn/max-nested-calls': ['error', { max: 4 }],
				// Conflicts with Remeda's sort function
				'unicorn/no-array-sort': 'off',
			},
		},
		{
			// These files run in the browser and might need browser globals
			files: ['src/components/**/*', 'packages/player/**/*'],
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
			files: ['**/*.tsx'],
			plugins: {
				'react-hooks': reactHooksPlugin as unknown as ESLint.Plugin,
			},
			rules: {
				...reactHooksPlugin.configs['recommended-latest'].rules,
				'react-hooks/component-hook-factories': 'error',
			},
		},
		getWebComponentConfig(['src/components/**/*.ts']),
		...getAstroConfig({ a11y: 'strict' }),
	],
	{
		customGlobals: { mode: 'readonly' },
	},
);
