// CRM layer. The ERP tables answer "what does this customer owe us"; these
// answer "how is this relationship going" — visits, calls, promises to pay and
// the follow-ups they create. Generated from the same seed as everything else.
import type { Bilingual, Customer, Dataset } from "./types";
import { seeded } from "./generate";

export type ContactKind = "visit" | "call" | "line" | "complaint" | "promise";
export type TaskKind = "collect" | "visit" | "quote" | "winback";

export interface Rep {
  id: string;
  name: Bilingual;
  provinces: string[];   // province.en values this rep covers
}

export interface Contact {
  id: string;
  customerId: string;
  day: number;
  kind: ContactKind;
  repId: string;
  note: Bilingual;
}

export interface Task {
  id: string;
  customerId: string;
  dueDay: number;
  kind: TaskKind;
  repId: string;
  done: boolean;
}

export interface CrmData {
  reps: Rep[];
  contacts: Contact[];          // newest first
  tasks: Task[];
  repById: Map<string, Rep>;
  repForCustomer: Map<string, string>;
  contactsByCustomer: Map<string, Contact[]>;
  tasksByCustomer: Map<string, Task[]>;
}

export const REPS: Rep[] = [
  { id: "R1", name: { th: "สมชาย ใจดี", en: "Somchai Jaidee" }, provinces: ["Lampang", "Lamphun"] },
  { id: "R2", name: { th: "วราภรณ์ ทองสุข", en: "Waraporn Thongsuk" }, provinces: ["Chiang Mai", "Mae Hong Son"] },
  { id: "R3", name: { th: "ณัฐพงษ์ คำแก้ว", en: "Nattapong Khamkaew" }, provinces: ["Chiang Rai", "Phayao", "Nan"] },
  { id: "R4", name: { th: "ปรียา วงศ์เมือง", en: "Preeya Wongmuang" }, provinces: ["Phrae", "Uttaradit", "Tak"] }
];

const NOTES: Record<ContactKind, Bilingual[]> = {
  visit: [
    { th: "เข้าเยี่ยมร้าน จัดเรียงชั้นวางใหม่", en: "Store visit, reset the shelf display" },
    { th: "เข้าเยี่ยมตามรอบ รับออร์เดอร์เพิ่ม 2 รายการ", en: "Routine visit, took two extra lines" },
    { th: "เข้าเยี่ยม ร้านขอโปรฯ ซื้อ 10 แถม 1", en: "Visit, shop asked for a buy-10-get-1 deal" }
  ],
  call: [
    { th: "โทรตามออร์เดอร์ประจำสัปดาห์", en: "Called about the weekly order" },
    { th: "โทรแจ้งสินค้าเข้าแล้ว", en: "Called to say the stock has arrived" },
    { th: "โทรไม่ติด ฝากข้อความไว้", en: "No answer, left a message" }
  ],
  line: [
    { th: "ตอบแชทไลน์ ส่งใบเสนอราคาให้แล้ว", en: "Answered on LINE, sent a quote" },
    { th: "ลูกค้าทักมาถามของใหม่ทางไลน์", en: "Customer asked about new lines on LINE" },
    { th: "ส่งรายการสินค้าขายดีให้ทางไลน์", en: "Sent the best-seller list on LINE" }
  ],
  complaint: [
    { th: "ร้องเรียนของส่งช้า 2 วัน", en: "Complained the delivery was two days late" },
    { th: "ได้รับสินค้าชำรุด ขอเปลี่ยน 1 ลัง", en: "Damaged goods, asked to swap one case" },
    { th: "แจ้งของขาดในบิล 1 รายการ", en: "Reported one line missing from the order" }
  ],
  promise: [
    { th: "รับปากว่าจะโอนภายในสิ้นสัปดาห์", en: "Promised to transfer by the end of the week" },
    { th: "ขอผ่อนชำระเป็น 2 งวด", en: "Asked to split the payment in two" },
    { th: "แจ้งว่ารอเช็คจากลูกค้าอีกทอด", en: "Waiting on a cheque from their own customer" }
  ]
};

let cached: CrmData | null = null;

export function getCrm(d: Dataset): CrmData {
  return (cached ??= generateCrm(d));
}

export function generateCrm(d: Dataset, seed = 424242): CrmData {
  const rand = seeded(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;

  const repForCustomer = new Map<string, string>();
  for (const c of d.customers) {
    const rep = REPS.find((r) => r.provinces.includes(c.province.en)) ?? REPS[0]!;
    repForCustomer.set(c.id, rep.id);
  }

  // when each customer last ordered, so contact history lines up with trading
  const lastOrder = new Map<string, number>();
  const orderCount = new Map<string, number>();
  for (const o of d.orders) {
    if (o.status === "cancelled") continue;
    lastOrder.set(o.customerId, o.day);
    orderCount.set(o.customerId, (orderCount.get(o.customerId) ?? 0) + 1);
  }

  const contacts: Contact[] = [];
  const tasks: Task[] = [];
  let cn = 1, tn = 1;

  for (const c of d.customers) {
    const repId = repForCustomer.get(c.id)!;
    const orders = orderCount.get(c.id) ?? 0;
    const last = lastOrder.get(c.id) ?? 0;
    // bigger accounts get visited more; everyone gets a few touches a quarter
    const touches = Math.max(2, Math.round(c.size * 1.4) + int(0, 3));

    for (let i = 0; i < touches; i++) {
      const day = Math.max(0, d.today - int(1, 180));
      const kind: ContactKind =
        c.channel === "wholesale" ? pick<ContactKind>(["visit", "visit", "call", "line", "complaint"])
        : c.channel === "line" ? pick<ContactKind>(["line", "line", "call", "visit"])
        : pick<ContactKind>(["call", "line", "visit", "complaint"]);
      contacts.push({ id: `CT${cn++}`, customerId: c.id, day, kind, repId, note: pick(NOTES[kind]) });
    }

    // a quiet account gets a win-back call booked
    const quiet = d.today - last;
    if (orders >= 5 && quiet > 21) {
      tasks.push({ id: `T${tn++}`, customerId: c.id, dueDay: d.today + int(0, 4), kind: "winback", repId, done: false });
      contacts.push({
        id: `CT${cn++}`, customerId: c.id, day: Math.max(0, d.today - int(1, 14)),
        kind: "call", repId, note: { th: "โทรถามว่าทำไมช่วงนี้ไม่ได้สั่งของ", en: "Called to ask why orders have stopped" }
      });
    }
  }

  // collection tasks for the worst debts, and a promise to pay on the record
  const unpaidByCustomer = new Map<string, number>();
  for (const o of d.orders) {
    if (o.status === "cancelled" || o.paidDay !== null || o.dueDay >= d.today) continue;
    unpaidByCustomer.set(o.customerId, (unpaidByCustomer.get(o.customerId) ?? 0) + o.total);
  }
  const worst = [...unpaidByCustomer].sort((a, b) => b[1] - a[1]).slice(0, 14);
  for (const [customerId] of worst) {
    const repId = repForCustomer.get(customerId)!;
    tasks.push({ id: `T${tn++}`, customerId, dueDay: d.today + int(-3, 3), kind: "collect", repId, done: false });
    contacts.push({
      id: `CT${cn++}`, customerId, day: Math.max(0, d.today - int(2, 30)),
      kind: "promise", repId, note: pick(NOTES.promise)
    });
  }

  // a scattering of routine visits and quotes already booked in
  for (let i = 0; i < 26; i++) {
    const c = pick(d.customers);
    tasks.push({
      id: `T${tn++}`, customerId: c.id, dueDay: d.today + int(-2, 10),
      kind: pick<TaskKind>(["visit", "quote"]), repId: repForCustomer.get(c.id)!, done: rand() < 0.25
    });
  }

  contacts.sort((a, b) => b.day - a.day);

  const contactsByCustomer = new Map<string, Contact[]>();
  for (const ct of contacts) {
    const list = contactsByCustomer.get(ct.customerId) ?? [];
    list.push(ct);
    contactsByCustomer.set(ct.customerId, list);
  }
  const tasksByCustomer = new Map<string, Task[]>();
  for (const t of tasks) {
    const list = tasksByCustomer.get(t.customerId) ?? [];
    list.push(t);
    tasksByCustomer.set(t.customerId, list);
  }

  return {
    reps: REPS,
    contacts,
    tasks: tasks.sort((a, b) => a.dueDay - b.dueDay),
    repById: new Map(REPS.map((r) => [r.id, r])),
    repForCustomer,
    contactsByCustomer,
    tasksByCustomer
  };
}

export const repOf = (crm: CrmData, c: Customer): Rep => crm.repById.get(crm.repForCustomer.get(c.id)!)!;
