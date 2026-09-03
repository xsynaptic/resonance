import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			'src/**/*.test.ts',
			'packages/scripts/src/**/*.test.ts',
			'packages/shared/src/**/*.test.ts',
		],
	},
});
