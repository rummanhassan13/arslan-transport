import { describe, expect, it } from "vitest";
import { ilikeContains, quoteFilterValue } from "./postgrestFilter";

describe("PostgREST filter values", () => {
  it("wraps plain text in quotes", () => {
    expect(quoteFilterValue("INV-2302")).toBe('"INV-2302"');
  });

  it("keeps commas and brackets inside the value instead of adding conditions", () => {
    expect(ilikeContains("destination", "x%,organization_id.neq.(1)")).toBe('destination.ilike."%x%,organization_id.neq.(1)%"');
  });

  it("escapes quotes and backslashes", () => {
    expect(quoteFilterValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});
