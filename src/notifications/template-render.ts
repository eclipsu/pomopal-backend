export function renderTemplate(
  text: string,
  context: Record<string, unknown>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = context[key];
    return val !== undefined && val !== null ? String(val) : '';
  });
}
