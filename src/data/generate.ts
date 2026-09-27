// Deterministic sample data: the same seed always produces the same business,
// so screenshots, tests and the live demo all agree with each other.
import type { Channel, Customer, Dataset, Order, OrderLine, Product, Bilingual } from "./types";
import { TODAY, parts } from "../lib/days";

/** Mulberry32: small, fast, seedable. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const C = {
  bev: { th: "เครื่องดื่ม", en: "Beverages" },
  snack: { th: "ขนมขบเคี้ยว", en: "Snacks" },
  staple: { th: "ของแห้ง", en: "Staples" },
  home: { th: "ของใช้ในบ้าน", en: "Household" },
  care: { th: "ของใช้ส่วนตัว", en: "Personal care" },
  dairy: { th: "นมและเครื่องดื่มนม", en: "Dairy" }
} satisfies Record<string, Bilingual>;

// [sku, th, en, category, supplier, cost, price, casePack, leadDays, popularity]
type Row = [string, string, string, Bilingual, string, number, number, number, number, number];
const CATALOGUE: Row[] = [
  ["BV-1001", "น้ำดื่มสิงห์ 600 มล. แพ็ค 12", "Singha water 600ml ×12", C.bev, "Boonrawd", 52, 64, 6, 3, 10],
  ["BV-1002", "น้ำดื่มคริสตัล 1.5 ล. แพ็ค 6", "Crystal water 1.5L ×6", C.bev, "Sermsuk", 48, 59, 4, 4, 8],
  ["BV-1010", "เอส โคล่า 325 มล. ลัง 24", "est Cola 325ml ×24", C.bev, "Sermsuk", 186, 219, 1, 4, 6],
  ["BV-1011", "เป๊ปซี่ 1.45 ล. แพ็ค 6", "Pepsi 1.45L ×6", C.bev, "Sermsuk", 132, 156, 2, 4, 5],
  ["BV-1020", "เนสกาแฟ เอสเปรสโซ่ กระป๋อง ลัง 24", "Nescafé Espresso can ×24", C.bev, "Nestlé TH", 288, 336, 1, 7, 4],
  ["BV-1030", "ชาเขียวโออิชิ 380 มล. ลัง 24", "Oishi green tea 380ml ×24", C.bev, "Oishi", 312, 360, 1, 6, 5],
  ["BV-1040", "เอ็ม-150 150 มล. แพ็ค 10", "M-150 150ml ×10", C.bev, "Osotspa", 98, 115, 5, 5, 9],
  ["BV-1041", "กระทิงแดง 150 มล. แพ็ค 10", "Krating Daeng 150ml ×10", C.bev, "TC Pharma", 96, 112, 5, 5, 7],
  ["SN-2001", "เลย์ รสโนริสาหร่าย 50 ก. โหล", "Lay's Nori Seaweed 50g ×12", C.snack, "Berli Jucker", 204, 240, 2, 5, 6],
  ["SN-2002", "เลย์ รสคลาสสิก 50 ก. โหล", "Lay's Classic 50g ×12", C.snack, "Berli Jucker", 204, 240, 2, 5, 6],
  ["SN-2010", "ทาโร่ ปลาเส้น 25 ก. โหล", "Taro fish snack 25g ×12", C.snack, "Berli Jucker", 96, 120, 4, 5, 5],
  ["SN-2020", "ปาปริก้า ข้าวเกรียบกุ้ง 60 ก. โหล", "Paprika prawn crackers 60g ×12", C.snack, "Thai Snack", 150, 180, 2, 8, 3],
  ["SN-2030", "เถ้าแก่น้อย สาหร่ายทอด 36 ก. โหล", "Tao Kae Noi seaweed 36g ×12", C.snack, "Tao Kae Noi", 276, 324, 2, 7, 4],
  ["SN-2040", "ขนมปังฟาร์มเฮ้าส์ แซนด์วิช แพ็ค 6", "Farmhouse sandwich bread ×6", C.snack, "President Bakery", 108, 126, 3, 2, 5],
  ["ST-3001", "ข้าวหอมมะลิ ตราฉัตร 5 กก.", "Chat jasmine rice 5kg", C.staple, "CP Rice", 212, 245, 4, 6, 7],
  ["ST-3002", "ข้าวเหนียวเขี้ยวงู 5 กก.", "Khiao Ngu sticky rice 5kg", C.staple, "Lanna Rice Mill", 185, 215, 4, 4, 8],
  ["ST-3010", "น้ำมันปาล์มโอลีน 1 ล.", "Olein palm oil 1L", C.staple, "Morakot", 44, 52, 12, 5, 9],
  ["ST-3011", "น้ำมันถั่วเหลืององุ่น 1 ล.", "Angoon soybean oil 1L", C.staple, "Thai Vegetable Oil", 56, 66, 12, 6, 5],
  ["ST-3020", "น้ำปลาทิพรส 700 มล.", "Tiparos fish sauce 700ml", C.staple, "Tiparos", 26, 32, 12, 7, 7],
  ["ST-3021", "ซอสปรุงรสภูเขาทอง 600 มล.", "Golden Mountain sauce 600ml", C.staple, "Thai Theparos", 34, 41, 12, 7, 6],
  ["ST-3030", "มาม่า ต้มยำกุ้ง ลัง 30", "Mama Tom Yum Kung ×30", C.staple, "Thai President Foods", 162, 186, 1, 5, 10],
  ["ST-3031", "ไวไว รสหมูสับ ลัง 30", "Wai Wai minced pork ×30", C.staple, "Thai Preserved Food", 150, 174, 1, 6, 6],
  ["ST-3040", "น้ำตาลทรายมิตรผล 1 กก.", "Mitr Phol sugar 1kg", C.staple, "Mitr Phol", 23, 28, 20, 5, 8],
  ["ST-3041", "ผงชูรสอายิโนะโมะโต๊ะ 500 ก.", "Ajinomoto MSG 500g", C.staple, "Ajinomoto TH", 48, 57, 12, 6, 5],
  ["ST-3050", "ปลากระป๋องสามแม่ครัว แพ็ค 10", "Sam Mae Krua sardines ×10", C.staple, "Haad Thip", 138, 160, 4, 7, 5],
  ["HH-4001", "ผงซักฟอกบรีส 2.5 กก.", "Breeze detergent 2.5kg", C.home, "Unilever TH", 172, 199, 4, 7, 5],
  ["HH-4002", "ผงซักฟอกโอโม 2.7 กก.", "Omo detergent 2.7kg", C.home, "Unilever TH", 168, 195, 4, 7, 5],
  ["HH-4010", "น้ำยาล้างจานซันไลต์ 500 มล.", "Sunlight dish soap 500ml", C.home, "Unilever TH", 29, 35, 24, 7, 7],
  ["HH-4020", "น้ำยาปรับผ้านุ่มดาวน์นี่ 1.3 ล.", "Downy softener 1.3L", C.home, "P&G TH", 118, 139, 6, 9, 4],
  ["HH-4030", "กระดาษชำระเซลล็อกซ์ แพ็ค 24", "Cellox toilet paper ×24", C.home, "Cellox", 142, 169, 4, 5, 6],
  ["HH-4040", "ถุงขยะแชมเปี้ยน 30x40 นิ้ว", "Champion bin bags 30×40in", C.home, "Champion", 58, 69, 20, 6, 4],
  ["HH-4050", "ยาจุดกันยุงไก่ลังกา 10 ขด", "Kai Langka mosquito coils ×10", C.home, "Kai Langka", 21, 26, 30, 8, 5],
  ["PC-5001", "สบู่ลักส์ 105 ก. แพ็ค 4", "Lux soap 105g ×4", C.care, "Unilever TH", 52, 62, 12, 7, 5],
  ["PC-5002", "แชมพูซันซิล 350 มล.", "Sunsilk shampoo 350ml", C.care, "Unilever TH", 92, 109, 12, 7, 4],
  ["PC-5010", "ยาสีฟันคอลเกต 150 ก.", "Colgate toothpaste 150g", C.care, "Colgate TH", 48, 57, 24, 8, 6],
  ["PC-5011", "ยาสีฟันดาร์ลี่ 160 ก.", "Darlie toothpaste 160g", C.care, "Hawley & Hazel", 54, 64, 24, 8, 4],
  ["PC-5020", "แป้งเย็นตรางู 280 ก.", "Snake Brand prickly heat 280g", C.care, "Osotspa", 62, 74, 12, 6, 5],
  ["PC-5030", "ผ้าอนามัยลอรีเอะ แพ็ค 8", "Laurier pads ×8", C.care, "Kao TH", 34, 41, 24, 9, 4],
  ["DA-6001", "นมไทยเดนมาร์ค UHT 200 มล. ลัง 48", "Thai-Denmark UHT 200ml ×48", C.dairy, "DPO", 396, 456, 1, 4, 6],
  ["DA-6002", "นมโฟร์โมสต์ UHT 180 มล. ลัง 48", "Foremost UHT 180ml ×48", C.dairy, "FrieslandCampina", 372, 432, 1, 5, 6],
  ["DA-6010", "นมเปรี้ยวดัชมิลล์ 180 มล. ลัง 48", "Dutch Mill yoghurt drink ×48", C.dairy, "Dutch Mill", 384, 444, 1, 5, 5],
  ["DA-6020", "โอวัลติน 3in1 แพ็ค 18", "Ovaltine 3-in-1 ×18", C.dairy, "Associated British Foods", 96, 113, 6, 8, 5],
  ["DA-6030", "นมข้นหวานมะลิ 388 ก.", "Mali condensed milk 388g", C.dairy, "Thai Dairy", 27, 33, 48, 6, 6]
];

const PROVINCES: Bilingual[] = [
  { th: "ลำปาง", en: "Lampang" }, { th: "เชียงใหม่", en: "Chiang Mai" }, { th: "ลำพูน", en: "Lamphun" },
  { th: "แพร่", en: "Phrae" }, { th: "น่าน", en: "Nan" }, { th: "พะเยา", en: "Phayao" },
  { th: "เชียงราย", en: "Chiang Rai" }, { th: "แม่ฮ่องสอน", en: "Mae Hong Son" },
  { th: "อุตรดิตถ์", en: "Uttaradit" }, { th: "ตาก", en: "Tak" }
];
// Lampang is home, so it gets most of the trade
const PROVINCE_WEIGHT = [9, 6, 4, 3, 2, 2, 3, 1, 2, 2];

const NAMES: Bilingual[] = [
  { th: "เจ๊หมวย", en: "Je Muay" }, { th: "ป้าแดง", en: "Pa Daeng" }, { th: "ลุงสม", en: "Lung Som" },
  { th: "พี่นก", en: "Phi Nok" }, { th: "สมศรี", en: "Somsri" }, { th: "บุญมา", en: "Boonma" },
  { th: "ทองดี", en: "Thongdee" }, { th: "แม่ศรี", en: "Mae Sri" }, { th: "อุดมสุข", en: "Udomsuk" },
  { th: "เจริญพร", en: "Charoenporn" }, { th: "รุ่งเรือง", en: "Rungrueang" }, { th: "มั่งมี", en: "Mangmee" },
  { th: "ศรีวิไล", en: "Sriwilai" }, { th: "ประเสริฐ", en: "Prasert" }, { th: "สุขใจ", en: "Sukjai" },
  { th: "กาดกองต้า", en: "Kad Kong Ta" }, { th: "ดอยคำ", en: "Doi Kham" }, { th: "น้ำงาม", en: "Nam Ngam" },
  { th: "วังเหนือ", en: "Wang Nuea" }, { th: "สบตุ๋ย", en: "Sop Tui" }, { th: "เวียงเหนือ", en: "Wiang Nuea" },
  { th: "ห้างฉัตร", en: "Hang Chat" }, { th: "เกาะคา", en: "Ko Kha" }, { th: "แม่ทะ", en: "Mae Tha" },
  { th: "เสริมงาม", en: "Soem Ngam" }, { th: "แจ้ห่ม", en: "Chae Hom" }, { th: "เถิน", en: "Thoen" },
  { th: "ทุ่งฝาย", en: "Thung Fai" }, { th: "พระบาท", en: "Phra Bat" }, { th: "ป่าตัน", en: "Pa Tan" },
  { th: "ท่าคราวน้อย", en: "Tha Khrao Noi" }, { th: "สวนดอก", en: "Suan Dok" }, { th: "หัวเวียง", en: "Hua Wiang" },
  { th: "พี่แอน", en: "Phi Ann" }, { th: "ลุงเปี้ย", en: "Lung Pia" }, { th: "ป้าจันทร์", en: "Pa Chan" },
  { th: "เฮงเฮง", en: "Heng Heng" }, { th: "โชคดี", en: "Chokdee" }, { th: "ทรัพย์ทวี", en: "Sap Thawi" },
  { th: "มีสุข", en: "Meesuk" }, { th: "นำชัย", en: "Namchai" }, { th: "ศรีสุข", en: "Srisuk" },
  { th: "บ้านสา", en: "Ban Sa" }, { th: "ปงแสนทอง", en: "Pong Saen Thong" }, { th: "บุญเรือง", en: "Boonrueang" }
];

const KINDS: Record<Channel, { th: string; en: string }[]> = {
  wholesale: [{ th: "หจก. %", en: "% Trading Ltd." }, { th: "ร้านค้าส่ง %", en: "% Wholesale" }, { th: "บจก. % ค้าส่ง", en: "% Distribution Co." }],
  shop: [{ th: "ร้าน%", en: "% Shop" }, { th: "มินิมาร์ท %", en: "% Mini Mart" }, { th: "ร้านชำ%", en: "% Grocery" },
         { th: "โชห่วย%", en: "% Corner Store" }, { th: "%พาณิชย์", en: "% Trading" }],
  online: [{ th: "% ช้อป", en: "% Shop Online" }, { th: "% ออนไลน์", en: "% Online" }],
  // LINE is how these accounts order, not part of their name; the channel column says it
  line: [{ th: "%สโตร์", en: "% Store" }, { th: "%มาร์ท", en: "% Mart" }]
};

function pickWeighted<T>(items: T[], weights: ArrayLike<number>, r: number): T {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i]!;
  let x = r * total;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i]!;
    if (x <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Monthly demand shape: Songkran in April, Loy Krathong and year end lift sales, the rainy season dips. */
const SEASON = [1.0, 0.95, 1.05, 1.28, 1.0, 0.9, 0.88, 0.9, 0.94, 1.02, 1.12, 1.22];
const WEEKDAY = [0.3, 1.05, 1.0, 1.0, 1.05, 1.1, 0.75]; // Sun..Sat

let cached: Dataset | null = null;

export function getDataset(): Dataset {
  return (cached ??= generate(20260922));
}

export function generate(seed: number, today = TODAY): Dataset {
  const rand = seeded(seed);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));

  const products: Product[] = CATALOGUE.map(([sku, th, en, category, supplier, cost, price, casePack, leadDays, popularity]) => ({
    sku, name: { th, en }, category, supplier, cost, price, casePack, leadDays, popularity, onHand: 0
  }));

  /* ------------------------------ customers ------------------------------ */
  const customers: Customer[] = [];
  const mix: [Channel, number][] = [["wholesale", 24], ["shop", 150], ["online", 18], ["line", 12]];
  let n = 1;
  const seen = new Map<string, number>();
  for (const [channel, count] of mix) {
    // draw name/kind pairs without replacement (a seeded Fisher-Yates shuffle);
    // picking at random with replacement collides constantly — the birthday problem
    const combos = NAMES.flatMap((who) => KINDS[channel].map((kind) => ({ who, kind })));
    for (let i = combos.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [combos[i], combos[j]] = [combos[j]!, combos[i]!];
    }
    for (let i = 0; i < count; i++) {
      const { who, kind } = combos[i % combos.length]!;
      const province = pickWeighted(PROVINCES, PROVINCE_WEIGHT, rand());
      const size =
        channel === "wholesale" ? between(3, 9) : channel === "shop" ? between(0.8, 2.6) : between(0.8, 2.2);
      const termsDays = channel === "wholesale" ? (rand() < 0.5 ? 30 : 45) : channel === "shop" ? (rand() < 0.6 ? 15 : 30) : 0;
      // a handful of accounts pay badly, which is what makes an ageing report worth having
      const reliability = rand() < 0.1 ? between(0.05, 0.35) : between(0.7, 1);
      // two shops with the same name would look like a duplicate row, so a
      // repeat becomes a numbered branch, which is how Thai shops name them anyway
      const base = { th: kind.th.replace("%", who.th), en: kind.en.replace("%", who.en) };
      const key = base.th + "|" + base.en;
      const times = (seen.get(key) ?? 0) + 1;
      seen.set(key, times);
      const name = times === 1 ? base : { th: `${base.th} สาขา ${times}`, en: `${base.en} (branch ${times})` };
      customers.push({
        id: `C${String(n++).padStart(4, "0")}`,
        name,
        province,
        channel,
        termsDays,
        creditLimit: 0, // set from purchase history once orders exist
        size,
        reliability
      });
    }
  }

  /* -------------------------------- orders -------------------------------- */
  const orders: Order[] = [];
  const prodWeights = products.map((p) => p.popularity);
  let seq = 1;

  // Each account has its own trajectory rather than a fixed weight: some grow,
  // some fade, and a handful stop buying altogether. Without this, per-customer
  // trends are just Poisson noise and a churn report has nothing real to find.
  const drift = customers.map(() => between(-0.45, 0.75));
  const stoppedAt = customers.map((c) =>
    // only established accounts churn, and only recently enough to still notice
    c.channel !== "wholesale" && rand() < 0.07 ? today - int(10, 70) : Infinity
  );
  const dayWeights = new Float64Array(customers.length);

  for (let day = 0; day <= today; day++) {
    const { month, weekday, year } = parts(day);
    const growth = 1 + 0.13 * (day / 365);
    const expected = 17 * growth * SEASON[month - 1]! * WEEKDAY[weekday]!;
    const count = Math.max(0, Math.round(expected + (rand() - 0.5) * 6));

    for (let i = 0; i < customers.length; i++) {
      const c = customers[i]!;
      dayWeights[i] = day > stoppedAt[i]! ? 0 : Math.max(0.05, c.size * (1 + drift[i]! * (day / 365)));
    }

    for (let k = 0; k < count; k++) {
      const customer = pickWeighted(customers, dayWeights, rand());
      const lineCount = customer.channel === "wholesale" ? int(3, 8) : customer.channel === "shop" ? int(2, 7) : int(1, 4);
      const lines: OrderLine[] = [];
      const used = new Set<string>();
      for (let l = 0; l < lineCount; l++) {
        const p = pickWeighted(products, prodWeights, rand());
        if (used.has(p.sku)) continue;
        used.add(p.sku);
        // wholesale buys whole cartons; shops and online buyers buy a few packs
        const base = customer.channel === "wholesale"
          ? p.casePack * int(1, 2)
          : int(1, Math.max(3, Math.ceil(p.casePack / 2)));
        const discount = customer.channel === "wholesale" ? 0.94 : customer.channel === "shop" ? 0.98 : 1.03;
        // costs creep up about 4% a year, prices follow a little behind
        const inflation = 1 + 0.04 * (day / 365);
        lines.push({
          sku: p.sku,
          qty: base,
          price: Math.round(p.price * discount * (1 + 0.03 * (day / 365)) * 100) / 100,
          cost: Math.round(p.cost * inflation * 100) / 100
        });
      }
      const total = Math.round(lines.reduce((s, x) => s + x.qty * x.price, 0) * 100) / 100;
      const cost = Math.round(lines.reduce((s, x) => s + x.qty * x.cost, 0) * 100) / 100;

      const age = today - day;
      const status =
        rand() < 0.015 ? "cancelled" : age === 0 ? "packing" : age <= 2 ? (rand() < 0.6 ? "shipped" : "delivered") : "delivered";

      const dueDay = day + customer.termsDays;
      let paidDay: number | null = null;
      if (status !== "cancelled") {
        if (customer.termsDays === 0) paidDay = day;
        else {
          // good payers land near the due date; poor ones drift weeks or months late
          const lateness = customer.reliability > 0.6
            ? Math.round((rand() - 0.55) * 14)
            : Math.round(rand() * 170 * (1 - customer.reliability));
          const when = dueDay + lateness;
          paidDay = when <= today ? Math.max(day, when) : null;
        }
      }

      // Shops move their ordering onto the LINE OA over time: roughly one order
      // in ten at the start of 2025, close to half by now.
      const lineShare = 0.1 + 0.36 * (day / today);
      const channel: Channel = customer.channel === "shop" && rand() < lineShare ? "line" : customer.channel;

      orders.push({
        id: `SO${String(year).slice(2)}-${String(seq++).padStart(6, "0")}`,
        day, customerId: customer.id, channel, status,
        lines, total, cost, dueDay, paidDay: status === "cancelled" ? null : paidDay
      });
    }
  }

  /* ---------------------------- credit limits ---------------------------- */
  // Limits come from what each account actually buys, the way a credit
  // controller would set them: about one and a half terms' worth of purchases.
  const recent = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "cancelled" || o.day <= today - 180) continue;
    recent.set(o.customerId, (recent.get(o.customerId) ?? 0) + o.total);
  }
  for (const c of customers) {
    if (!c.termsDays) continue;
    const perMonth = (recent.get(c.id) ?? 0) / 6;
    const limit = perMonth * (c.termsDays / 30) * 1.5 + 5000;
    c.creditLimit = Math.max(10_000, Math.round(limit / 5000) * 5000);
  }

  /* ------------------------------- stock ------------------------------- */
  // on-hand is set relative to recent demand so some SKUs are healthy,
  // some are close to the reorder point and a few have run out
  const sold30 = new Map<string, number>();
  for (let i = orders.length - 1; i >= 0; i--) {
    const o = orders[i]!;
    if (o.day <= today - 30) break;
    if (o.status === "cancelled") continue;
    for (const l of o.lines) sold30.set(l.sku, (sold30.get(l.sku) ?? 0) + l.qty);
  }
  for (const p of products) {
    const perDay = (sold30.get(p.sku) ?? 0) / 30;
    const r = rand();
    const cover = r < 0.08 ? 0 : r < 0.25 ? between(1, p.leadDays + 3) : between(p.leadDays + 6, 55);
    p.onHand = Math.round(perDay * cover);
  }

  return {
    products,
    customers,
    orders,
    today,
    productBySku: new Map(products.map((p) => [p.sku, p])),
    customerById: new Map(customers.map((c) => [c.id, c]))
  };
}
