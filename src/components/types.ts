// TypeScript does not deal well with Astro files exporting types, so shared component types live here

// Values map onto divided-* classes in divided-item.css
export type DividerColor = 'default' | 'lighter';

export type DividerContent = 'chevron' | 'dot' | 'slash';

export type DividerWeight = 'thin';
