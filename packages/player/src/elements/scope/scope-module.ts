import { lazyModule } from '#lib/lazy-module.ts';

export const scopeSurfaceModule = lazyModule('scope', async () => {
	const { connectScopeSurface } = await import('#elements/scope/scope-surface.ts');

	return connectScopeSurface;
});
