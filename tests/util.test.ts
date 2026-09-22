import { describe, expect, test } from "vitest";
import { parseHash, scrollToReveal, sortRows, toCsv, visibleRange } from "../src/lib/util";
import { makeFormat, makeT, TABLES } from "../src/lib/i18n";
import { dayFromParts } from "../src/lib/days";

describe("virtual window", () => {
  test("renders the rows in view plus overscan", () => {
    expect(visibleRange(0, 440, 44, 10_000, 6)).toEqual({ start: 0, end: 17 });
    // scrolled to row 100: 6 rows of overscan above, 11 visible, 6 below
    expect(visibleRange(4400, 440, 44, 10_000, 6)).toEqual({ start: 94, end: 117 });
  });

  test("never runs past either end", () => {
    expect(visibleRange(-50, 440, 44, 10_000).start).toBe(0);
    expect(visibleRange(1e9, 440, 44, 30).end).toBe(30);
    expect(visibleRange(0, 440, 44, 0)).toEqual({ start: 0, end: 0 });
  });

  test("the DOM stays small however long the list is", () => {
    const { start, end } = visibleRange(123_456, 600, 44, 1_000_000);
    expect(end - start).toBeLessThan(40);
  });

  test("scrolling reveals a row only when it is out of view", () => {
    expect(scrollToReveal(5, 0, 440, 44)).toBe(0);            // already visible
    expect(scrollToReveal(20, 0, 440, 44)).toBe(21 * 44 - 440); // below: align to bottom
    expect(scrollToReveal(2, 400, 440, 44)).toBe(88);          // above: align to top
  });
});

describe("sorting", () => {
  test("numbers sort numerically in both directions", () => {
    const rows = [{ v: 10 }, { v: 2 }, { v: 33 }];
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.v)).toEqual([2, 10, 33]);
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.v)).toEqual([33, 10, 2]);
  });

  test("empty values go last whichever way you sort", () => {
    const rows = [{ v: null }, { v: 3 }, { v: 1 }];
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.v)).toEqual([1, 3, null]);
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.v)).toEqual([3, 1, null]);
  });

  test("ties keep their original order", () => {
    const rows = [{ k: "a", v: 1 }, { k: "b", v: 1 }, { k: "c", v: 1 }];
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.k)).toEqual(["a", "b", "c"]);
  });

  test("codes with numbers sort naturally", () => {
    const rows = ["SO26-000010", "SO26-000009", "SO26-000100"].map((id) => ({ id }));
    expect(sortRows(rows, (r) => r.id, "asc").map((r) => r.id)).toEqual(["SO26-000009", "SO26-000010", "SO26-000100"]);
  });

  test("Thai text sorts by Thai collation, not code point", () => {
    const rows = ["ร้านเจ๊หมวย", "กาดกองต้า", "มินิมาร์ท"].map((n) => ({ n }));
    expect(sortRows(rows, (r) => r.n, "asc")[0]!.n).toBe("กาดกองต้า");
  });
});

describe("CSV", () => {
  test("quotes cells that need it", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], ["line\nbreak", 3]]))
      .toBe('a,b\n"x,y","say ""hi"""\n"line\nbreak",3');
  });
});

describe("routing", () => {
  test("parses path and query from the hash", () => {
    const r = parseHash("#/orders?status=packing&range=all");
    expect(r.path).toBe("/orders");
    expect(r.params.get("status")).toBe("packing");
    expect(r.params.get("range")).toBe("all");
  });

  test("an empty hash is the overview", () => {
    expect(parseHash("").path).toBe("/");
    expect(parseHash("#").path).toBe("/");
  });
});

describe("translations", () => {
  const keys = Object.keys(TABLES.th) as (keyof typeof TABLES.th)[];

  test("every string exists and is non-empty in both languages", () => {
    for (const k of keys) {
      expect(TABLES.th[k], `th.${k}`).not.toBe("");
      expect(TABLES.en[k], `en.${k}`).not.toBe("");
    }
  });

  test("placeholders match between Thai and English", () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of keys) expect(holes(TABLES.en[k]), k).toBe(holes(TABLES.th[k]));
  });

  test("variables are filled in", () => {
    expect(makeT("en")("rows", { n: 12 })).toBe("12 rows");
    expect(makeT("th")("rows", { n: 12 })).toBe("12 รายการ");
  });

  test("Thai dates use the Buddhist-era year", () => {
    const day = dayFromParts(2026, 9, 22);
    expect(makeFormat("th").dateLong(day)).toContain("2569");
    expect(makeFormat("en").dateLong(day)).toContain("2026");
  });

  test("currency is baht in both languages", () => {
    expect(makeFormat("en").baht(1234)).toMatch(/฿|THB/);
    expect(makeFormat("th").baht(1234)).toMatch(/฿|THB|บาท/);
  });
});
