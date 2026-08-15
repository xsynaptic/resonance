import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';

// Bare inline-markdown processor for list-item descriptions, NOT the astro.config MDX pipeline
// So <Link>/<Img> render as literal text; memoized, since building one is expensive
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
