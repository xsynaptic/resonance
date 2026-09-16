import { lazyModule } from '#lib/lazy-module.ts';

export const panelSurfaceModule = lazyModule('panel', async () => {
	const { connectPanelSurface } = await import('#elements/panel/panel-surface.ts');

	return connectPanelSurface;
});
