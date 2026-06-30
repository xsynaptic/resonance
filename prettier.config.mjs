/**
 * @type {import('prettier').Config}
 */
export default {
	overrides: [
		{
			files: ['*.astro'],
			options: {
				parser: 'astro',
			},
		},
	],
	plugins: ['prettier-plugin-astro', 'prettier-plugin-tailwindcss'],
	printWidth: 100,
	singleQuote: true,
	tailwindStylesheet: './src/styles/main.css',
	useTabs: true,
};
