import type { AstroGlobal } from 'astro';

// Render an Astro slot to an HTML string, returning undefined when empty or whitespace-only
export async function renderSlot(slots: AstroGlobal['slots'], slotName = 'default') {
	const content = (await slots.render(slotName)) as string | undefined;

	return content?.trim() || undefined;
}
