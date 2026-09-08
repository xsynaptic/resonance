import { buildCandidates } from '#og-image/built-entries.ts';
import { createCardRenderer } from '#og-image/generate.ts';

const setup = Promise.all([buildCandidates(), createCardRenderer()]);

export async function renderCardById(outputId: string): Promise<Uint8Array | undefined> {
	const [candidates, renderCard] = await setup;

	const entry = candidates.get(outputId);

	if (!entry) return undefined;

	return renderCard(entry);
}
