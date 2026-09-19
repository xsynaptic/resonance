/** @type {import('stylelint').Config} */
export default {
	extends: ['@xsynaptic/stylelint-config'],
	ignoreFiles: ['**/playwright-report/**'],
	reportDescriptionlessDisables: true,
};
