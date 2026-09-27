import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SalesAnalysis } from "../src/pages/SalesAnalysis";
import { getDataset } from "../src/data/generate";
import { I18nContext, makeFormat, makeT } from "../src/lib/i18n";
afterEach(cleanup);
function setup() {
  render(<I18nContext.Provider value={{ lang: "en", t: makeT("en"), f: makeFormat("en") }}><SalesAnalysis data={getDataset()} /></I18nContext.Provider>);
}
test("custom dates reject reversed periods and recover when corrected", () => {
  setup();
  fireEvent.change(screen.getByRole("combobox", { name: "Compare with" }), { target: { value: "custom" } });
  fireEvent.change(screen.getByLabelText("Current: start"), { target: { value: "2026-09-23" } });
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("Evidence-based summary")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Current: start"), { target: { value: "2026-09-01" } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("Evidence-based summary")).toBeInTheDocument();
});
test("calendar filters products, switches metrics and keeps future cells disabled", () => {
  setup();
  const name = getDataset().products[0]!.name.en;
  fireEvent.change(screen.getByLabelText("Search calendar"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Calendar metric"), { target: { value: "qty" } });
  fireEvent.change(screen.getByLabelText("Color scale"), { target: { value: "relative" } });
  const cells = screen.getAllByRole("button").filter((el) => el.getAttribute("aria-label")?.startsWith(name + ","));
  expect(cells).toHaveLength(12);
  expect(cells[8]).toBeEnabled();
  expect(cells[9]).toBeDisabled();
  expect(cells[0]?.textContent).toContain("×");
});
