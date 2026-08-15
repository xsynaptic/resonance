import { z } from 'zod';

// Artist ref: a bare string is free text (no link); an object links via `id` (must match the catalog)
// Optional `name` overrides the derived title
// Free text is the default, since most names aren't cataloged
export const RefSchema = z.union([
	z.string(),
	z.object({ id: z.string(), name: z.string().optional() }).strict(),
]);

export type RefValue = z.infer<typeof RefSchema>;

// Label ref: the same rule, plus an optional catalog code (only meaningful with an id)
export const LabelRefSchema = z.union([
	z.string(),
	z.object({ code: z.string().optional(), id: z.string(), name: z.string().optional() }).strict(),
]);

export type LabelRefValue = z.infer<typeof LabelRefSchema>;
