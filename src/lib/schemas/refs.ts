import { z } from 'zod';

// A reference to an artist (or self-referential act/person). A bare string is free text with no link;
// an object must carry an `id` matching a catalog entry, with an optional `name` that overrides the
// taxonomy-derived display name. Free text is the default because most names are not in the catalog.
export const RefSchema = z.union([
	z.string(),
	z.object({ id: z.string(), name: z.string().optional() }).strict(),
]);

export type RefValue = z.infer<typeof RefSchema>;

// A reference to a label: the same rule, plus an optional catalog code (only meaningful with an id).
export const LabelRefSchema = z.union([
	z.string(),
	z.object({ code: z.string().optional(), id: z.string(), name: z.string().optional() }).strict(),
]);

export type LabelRefValue = z.infer<typeof LabelRefSchema>;
