import { z } from 'zod';

// Artist credit: a bare string is free text (no link); an object links via `id` (must match the catalog)
// Optional `name` overrides the derived title
// Free text is the default, since most names aren't cataloged
export const CreditSchema = z.union([
	z.string(),
	z.object({ id: z.string(), name: z.string().optional() }).strict(),
]);

export type CreditValue = z.infer<typeof CreditSchema>;

// Label credit: the same rule, plus an optional catalog code (only meaningful with an id)
export const LabelCreditSchema = z.union([
	z.string(),
	z.object({ code: z.string().optional(), id: z.string(), name: z.string().optional() }).strict(),
]);

export type LabelCreditValue = z.infer<typeof LabelCreditSchema>;
