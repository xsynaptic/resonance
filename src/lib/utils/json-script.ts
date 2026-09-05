// `set:html` does not escape, so a title carrying `</script>` would otherwise close the element
// Escaping `<` is enough; nothing else can end a script's body
export function jsonForScript(value: unknown): string {
	return JSON.stringify(value).replaceAll('<', String.raw`\u003c`);
}
