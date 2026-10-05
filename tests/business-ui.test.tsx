import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Business } from "../src/pages/Business";
import { getDataset } from "../src/data/generate";
import { I18nContext, makeFormat, makeT } from "../src/lib/i18n";
afterEach(() => { cleanup(); localStorage.clear(); });
function setup() { render(<I18nContext.Provider value={{ lang:"en",t:makeT("en"),f:makeFormat("en") }}><Business data={getDataset()} /></I18nContext.Provider>); }
test("blank expenses never become zero and scenario edits survive tab switches", () => {
  setup();
  fireEvent.click(screen.getByRole("tab",{name:"2. Profit / loss"}));
  const profit = within(screen.getByRole("tabpanel"));
  expect(profit.getAllByText("Incomplete costs")).toHaveLength(2);
  for (const label of ["Selling fees","Shop-paid shipping","Advertising","Rent / wages / other expenses"]) fireEvent.change(profit.getByLabelText(label),{target:{value:"0"}});
  expect(profit.queryByText("Incomplete costs")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab",{name:"3. Compare offers"}));
  const offers = within(screen.getByRole("tabpanel"));
  fireEvent.change(offers.getByLabelText("Discount (%)"),{target:{value:"25"}});
  fireEvent.click(screen.getByRole("tab",{name:"2. Profit / loss"}));
  fireEvent.click(screen.getByRole("tab",{name:"3. Compare offers"}));
  expect(within(screen.getByRole("tabpanel")).getByLabelText("Discount (%)")).toHaveValue(25);
});
test("campaign validation and local persistence preserve user-entered facts", () => {
  setup(); fireEvent.click(screen.getByRole("tab",{name:"4. Campaign results"}));
  const panel = within(screen.getByRole("tabpanel"));
  fireEvent.click(panel.getByRole("button",{name:"Save and review"}));
  expect(localStorage.getItem("erp.business.campaigns.v1")).toBeNull();
  fireEvent.change(panel.getByLabelText("Campaign name"),{target:{value:"Test promotion"}});
  fireEvent.change(panel.getByLabelText("Additional campaign costs (exclude discounts in bills)"),{target:{value:"100"}});
  fireEvent.change(panel.getByLabelText("Target profit after campaign cost"),{target:{value:"500"}});
  fireEvent.click(panel.getByRole("button",{name:"Save and review"}));
  const records = JSON.parse(localStorage.getItem("erp.business.campaigns.v1")!);
  expect(records).toHaveLength(1); expect(records[0]).toMatchObject({name:"Test promotion",budget:100,target:500});
  expect(panel.getByText("Saved and calculated from sales history")).toBeInTheDocument();
});
