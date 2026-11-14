// Values typed by users must not change the shape of a PostgREST `.or(...)` filter.
// Commas, dots, parentheses and quotes have meaning there, so wrap the value in
// double quotes and escape backslashes and quotes inside it.
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** An `ilike` condition that matches `text` anywhere in `column`, safe for use inside `.or(...)`. */
export function ilikeContains(column: string, text: string): string {
  return `${column}.ilike.${quoteFilterValue(`%${text}%`)}`;
}
