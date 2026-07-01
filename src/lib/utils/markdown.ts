import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';

// Render list-item descriptions, which live in frontmatter as raw markdown. This is a bare processor
// for simple inline markdown (links, emphasis); it does NOT carry the astro.config MDX pipeline, so
// component syntax like <Link>/<Img> would render as literal text. Memoized (expensive to build).
type Processor = Awaited<ReturnType<typeof createSatteriMarkdownProcessor>>;

let processorPromise: Promise<Processor> | undefined;

export async function renderMarkdown(text: string): Promise<string> {
	const processor = await getProcessor();
	const { code } = await processor.render(text);
	return code;
}

async function getProcessor(): Promise<Processor> {
	processorPromise ??= createSatteriMarkdownProcessor({});
	return processorPromise;
}
