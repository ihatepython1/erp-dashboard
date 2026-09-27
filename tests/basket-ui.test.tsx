import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Basket } from "../src/pages/Basket";
import { getDataset } from "../src/data/generate";
import { basketPairs } from "../src/data/basket";
import { I18nContext, makeFormat, makeT } from "../src/lib/i18n";
afterEach(cleanup);
test("selecting a different pair updates bundle contents and discount results", () => {
  const data = getDataset();
  render(<I18nContext.Provider value={{ lang: "en", t: makeT("en"), f: makeFormat("en") }}><Basket data={data} /></I18nContext.Provider>);
  fireEvent.click(screen.getAllByRole("button", { name: "Simulate this pair" })[1]!);
  const region = screen.getByRole("region", { name: "Bundle promotion simulator" });
  expect(region).toHaveTextContent(basketPairs(data).pairs[1]!.a.name.en);
  fireEvent.change(within(region).getByLabelText("Bundle discount (%)"), { target: { value: "100" } });
  expect(region).toHaveTextContent("Discounted price leaves no positive profit per bundle.");
});
