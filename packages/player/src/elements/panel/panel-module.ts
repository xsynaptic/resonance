import { lazyModule } from '#lib/lazy-module.ts';

export const panelSurfaceModule = lazyModule(async () => {
	const { connectPanelSurface } = await import('#elements/panel/panel-surface.ts');

	return connectPanelSurface;
});
