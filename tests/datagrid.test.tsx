import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DataGrid, type Column } from "../src/components/DataGrid";

afterEach(cleanup);

interface Row { id: string; name: string; amount: number }

const rows: Row[] = Array.from({ length: 10_000 }, (_, i) => ({
  id: `R${i}`,
  name: `Customer ${String(i).padStart(5, "0")}`,
  amount: (i * 7919) % 10_007
}));

const columns: Column<Row>[] = [
  { id: "name", header: "Name", width: "1fr", sort: (r) => r.name, cell: (r) => r.name },
  { id: "amount", header: "Amount", width: "120px", align: "end", sort: (r) => r.amount, cell: (r) => r.amount }
];

function setup(onOpen = vi.fn()) {
  render(<DataGrid label="Test grid" rows={rows} columns={columns} rowKey={(r) => r.id}
                   onOpen={onOpen} height={440} rowHeight={44} />);
  const grid = screen.getByRole("grid", { name: "Test grid" });
  const body = grid.querySelector<HTMLElement>(".grid-body")!;
  const dataRows = () => within(grid).getAllByRole("row").slice(1);   // minus the header
  return { grid, body, dataRows, onOpen };
}

describe("DataGrid", () => {
  test("renders a small window of rows, not all ten thousand", () => {
    const { grid, dataRows } = setup();
    expect(grid).toHaveAttribute("aria-rowcount", "10001");
    expect(dataRows().length).toBeLessThan(30);
    expect(dataRows()[0]).toHaveTextContent("Customer 00000");
  });

  test("scrolling moves the window", () => {
    const { body, dataRows } = setup();
    fireEvent.scroll(body, { target: { scrollTop: 44 * 5000 } });
    const text = dataRows().map((r) => r.textContent).join(" ");
    expect(text).toContain("Customer 05000");
    expect(text).not.toContain("Customer 00000");
  });

  test("clicking a header sorts and announces the direction", () => {
    const { grid, dataRows } = setup();
    const header = within(grid).getByRole("columnheader", { name: /Amount/ });
    expect(header).toHaveAttribute("aria-sort", "none");

    fireEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");   // numbers open biggest first
    expect(dataRows()[0]).toHaveTextContent("10006");

    fireEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    const amountCell = within(dataRows()[0]!).getAllByRole("gridcell")[1]!;
    expect(amountCell).toHaveTextContent(/^0$/);
  });

  test("arrow keys move the active row and Enter opens it", () => {
    const { body, onOpen } = setup();
    body.focus();
    fireEvent.keyDown(body, { key: "ArrowDown" });
    fireEvent.keyDown(body, { key: "ArrowDown" });
    const active = document.getElementById(body.getAttribute("aria-activedescendant")!);
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(active).toHaveTextContent("Customer 00002");

    fireEvent.keyDown(body, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(rows[2]);
  });

  test("End jumps to the last row and brings it into view", () => {
    const { body } = setup();
    fireEvent.keyDown(body, { key: "End" });
    const active = document.getElementById(body.getAttribute("aria-activedescendant")!);
    expect(active).not.toBeNull();
    expect(active).toHaveTextContent("Customer 09999");
    expect(active).toHaveAttribute("aria-rowindex", "10001");
  });

  test("shows the empty message when there are no rows", () => {
    render(<DataGrid label="Empty" rows={[]} columns={columns} rowKey={(r) => r.id} empty="Nothing matches" />);
    expect(screen.getByText("Nothing matches")).toBeInTheDocument();
  });
});
