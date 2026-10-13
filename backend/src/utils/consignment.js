// src/utils/consignment.js
// Consignment = stock given to an outside B2B party to sell. It stays in the OWNER shop's
// inventory (and books); nothing moves in `inventory`. A record in `consignments` says
// "N units of this product are with party X". Sales are invoiced under the owner shop,
// so cash / profit / register stay with the owner.

const CREATE_SQL = [
  `CREATE TABLE IF NOT EXISTS consignment_parties (
     id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     name       VARCHAR(150) NOT NULL,
     phone      VARCHAR(50),
     is_active  BOOLEAN NOT NULL DEFAULT true,
     created_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_consignment_parties_name ON consignment_parties (LOWER(TRIM(name)))`,
  `CREATE TABLE IF NOT EXISTS consignments (
     id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     product_id    UUID NOT NULL REFERENCES products(id),
     owner_shop_id INTEGER NOT NULL REFERENCES shops(id),
     party_id      UUID NOT NULL REFERENCES consignment_parties(id),
     qty           INTEGER NOT NULL CHECK (qty > 0),
     sold_qty      INTEGER NOT NULL DEFAULT 0 CHECK (sold_qty >= 0),
     returned_qty  INTEGER NOT NULL DEFAULT 0 CHECK (returned_qty >= 0),
     given_date    DATE NOT NULL DEFAULT CURRENT_DATE,
     notes         TEXT,
     created_by    UUID REFERENCES users(id),
     created_at    TIMESTAMPTZ DEFAULT NOW(),
     CHECK (sold_qty + returned_qty <= qty)
   )`,
  `CREATE TABLE IF NOT EXISTS consignment_events (
     id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     consignment_id UUID NOT NULL REFERENCES consignments(id) ON DELETE CASCADE,
     event_type     VARCHAR(10) NOT NULL CHECK (event_type IN ('sold','returned')),
     qty            INTEGER NOT NULL CHECK (qty > 0),
     invoice_id     UUID REFERENCES sales_invoices(id),
     event_date     DATE NOT NULL DEFAULT CURRENT_DATE,
     created_by     UUID REFERENCES users(id),
     created_at     TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_consignments_owner_product ON consignments(owner_shop_id, product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_consignment_events_cons ON consignment_events(consignment_id)`,
];

// Safe to run any number of times (used by migration + at server start).
async function ensureTables(queryFn) {
  for (const sql of CREATE_SQL) await queryFn(sql);
}

// Sales / transfers / adjustments must keep working even if the tables are not there yet.
async function tableExists(client) {
  const r = await client.query(`SELECT to_regclass('public.consignments') AS t`);
  return !!r.rows[0].t;
}

// Units of a product in a shop that are currently lying with a B2B party.
async function openConsigned(client, productId, shopId) {
  if (!(await tableExists(client))) return 0;
  const r = await client.query(
    `SELECT COALESCE(SUM(qty - sold_qty - returned_qty), 0)::int AS n
     FROM consignments WHERE product_id = $1 AND owner_shop_id = $2`,
    [productId, parseInt(shopId)]
  );
  return r.rows[0].n;
}

// Throws if taking `qtyOut` units out of `shopId` would eat into consigned stock.
// `onHand` = the shop's inventory quantity right now.
async function assertFreeStock(client, productId, shopId, onHand, qtyOut, label) {
  const open = await openConsigned(client, productId, shopId);
  if (open > 0 && onHand - qtyOut < open) {
    const free = Math.max(onHand - open, 0);
    throw new Error(
      `${label ? label + ': ' : ''}${open} unit(s) are on consignment with a party — ` +
      `only ${free} free here. Return the consignment first.`
    );
  }
}

async function markSold(client, c, take, invoiceId, saleDate, userId) {
  await client.query(`UPDATE consignments SET sold_qty = sold_qty + $1 WHERE id = $2`, [take, c.id]);
  await client.query(
    `INSERT INTO consignment_events (consignment_id, event_type, qty, invoice_id, event_date, created_by)
     VALUES ($1,'sold',$2,$3,$4,$5)`,
    [c.id, take, invoiceId, saleDate, userId]
  );
}

// Called by createSale INSIDE its transaction, after the invoice + stock deduction.
//  - item.consignment_id given  -> sells from that consignment record (Consignment page).
//  - item has an IMEI/serial    -> any open consignment of that product is closed as sold.
//  - plain qty item, no record  -> must not use units that are lying with a party.
async function consumeForSale(client, { items, shopId, invoiceId, saleDate, userId, serviceMap, stockMap, nameMap }) {
  const exists = await tableExists(client);
  if (!exists) {
    if (items.some(i => i.consignment_id)) throw new Error('Consignment is not set up yet');
    return;
  }
  const shop = parseInt(shopId);
  for (const item of items) {
    if (serviceMap[item.product_id]) continue;
    const qty = parseInt(item.qty) || 1;

    if (item.consignment_id) {
      const r = await client.query(`SELECT * FROM consignments WHERE id = $1 FOR UPDATE`, [item.consignment_id]);
      const c = r.rows[0];
      if (!c) throw new Error('Consignment record not found');
      if (String(c.product_id).toLowerCase() !== String(item.product_id).toLowerCase() || c.owner_shop_id !== shop)
        throw new Error('Consignment record does not match this item / shop');
      const open = c.qty - c.sold_qty - c.returned_qty;
      if (qty > open) throw new Error(`Only ${open} unit(s) left open in this consignment`);
      await markSold(client, c, qty, invoiceId, saleDate, userId);
      continue;
    }

    const rows = await client.query(
      `SELECT * FROM consignments
       WHERE product_id = $1 AND owner_shop_id = $2 AND qty - sold_qty - returned_qty > 0
       ORDER BY given_date, created_at FOR UPDATE`,
      [item.product_id, shop]
    );
    if (!rows.rows.length) continue;

    const p = await client.query(`SELECT serial_number FROM products WHERE id = $1`, [item.product_id]);
    const hasSerial = !!(p.rows[0] && p.rows[0].serial_number && String(p.rows[0].serial_number).trim());

    if (hasSerial) {
      let left = qty;
      for (const c of rows.rows) {
        if (left <= 0) break;
        const take = Math.min(left, c.qty - c.sold_qty - c.returned_qty);
        await markSold(client, c, take, invoiceId, saleDate, userId);
        left -= take;
      }
    } else {
      const openSum = rows.rows.reduce((s, c) => s + (c.qty - c.sold_qty - c.returned_qty), 0);
      const before  = stockMap[item.product_id]?.[shop] ?? 0;
      if (before - qty < openSum) {
        const label = nameMap?.[item.product_id] || 'Item';
        throw new Error(
          `"${label}": ${openSum} unit(s) are with a party on consignment — only ` +
          `${Math.max(before - openSum, 0)} free here. Sell consigned units from the Consignment page.`
        );
      }
    }
  }
}

module.exports = { ensureTables, tableExists, openConsigned, assertFreeStock, consumeForSale };
