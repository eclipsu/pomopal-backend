const CUSTOM_FONT_RE =
  /^font:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Stable CSS family derived from the font row id. */
export function fontFamilyFromId(id: string): string {
  return `PomopalFont_${id.replace(/-/g, '').slice(0, 16)}`;
}

/** Layout / dropdown token for a custom library font. */
export function customFontToken(id: string): string {
  return `font:${id}`;
}

export function parseCustomFontId(timerFont: string | null | undefined): string | null {
  if (!timerFont) return null;
  const m = CUSTOM_FONT_RE.exec(timerFont.trim());
  return m ? m[1].toLowerCase() : null;
}

export function isCustomFontToken(timerFont: string | null | undefined): boolean {
  return Boolean(parseCustomFontId(timerFont));
}
