import { ImageFeaturedSchema } from '@xsynaptic/shared/schemas';

// Frontmatter arrives from the data store untyped, so the ids are parsed rather than cast
export function extractImageFeaturedIds(frontmatter: Record<string, unknown>): Array<string> {
	const parsed = ImageFeaturedSchema.safeParse(frontmatter.imageFeatured);

	if (!parsed.success) return [];
	if (typeof parsed.data === 'string') return [parsed.data];

	return parsed.data.map((item) => (typeof item === 'string' ? item : item.id));
}
