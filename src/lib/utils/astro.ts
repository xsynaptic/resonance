import type { AstroGlobal } from 'astro';

export async function renderSlot(slots: AstroGlobal['slots'], slotName = 'default') {
	const content = (await slots.render(slotName)) as string | undefined;

	return content?.trim() || undefined;
}
