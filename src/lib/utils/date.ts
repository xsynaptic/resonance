import { getDateTimeFormat } from '#lib/i18n/i18n-formatters.ts';

export function formatDate(date: Date): string {
	// Frontmatter dates parse to UTC midnight; format in UTC so the calendar day never shifts
	return getDateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}
