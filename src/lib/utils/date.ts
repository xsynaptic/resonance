// Frontmatter dates parse to UTC midnight; format in UTC so the calendar day never shifts
const longDateFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' });

export function formatDate(date: Date): string {
	return longDateFormatter.format(date);
}
