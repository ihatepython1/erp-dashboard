// Domain model for a wholesale distributor. Dates are stored as day numbers
// (days since DAY0) so filtering and ageing are integer maths, not Date parsing.

export type Channel = "wholesale" | "shop" | "online" | "line";
export type OrderStatus = "packing" | "shipped" | "delivered" | "cancelled";
export type Bilingual = { th: string; en: string };

export interface Product {
  sku: string;
  name: Bilingual;
  category: Bilingual;
  supplier: string;
  cost: number;          // per unit, THB
  price: number;         // list price per unit, THB
  casePack: number;      // units per case, used to round reorder quantities
  leadDays: number;      // supplier lead time
  popularity: number;    // relative demand weight
  onHand: number;
}

export interface Customer {
  id: string;
  name: Bilingual;
  province: Bilingual;
  channel: Channel;
  termsDays: number;     // credit terms; 0 = pays on order
  creditLimit: number;
  size: number;          // relative order volume
  reliability: number;   // 0..1, how promptly they pay
}

export interface OrderLine {
  sku: string;
  qty: number;
  price: number;         // unit price actually charged
  cost: number;          // unit cost at the time of sale
}

export interface Order {
  id: string;
  day: number;
  customerId: string;
  channel: Channel;
  status: OrderStatus;
  lines: OrderLine[];
  total: number;
  cost: number;
  dueDay: number;
  paidDay: number | null; // null = still outstanding
}

export interface Dataset {
  products: Product[];
  customers: Customer[];
  orders: Order[];
  today: number;
  productBySku: Map<string, Product>;
  customerById: Map<string, Customer>;
}
