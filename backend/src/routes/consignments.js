// src/routes/consignments.js
// Consignment: stock given to an outside B2B party to sell. It stays in the OWNER shop's inventory.
// Invoices are created through the normal POST /sales (items[].consignment_id) under the owner shop.
const express = require('express');
const router  = express.Router();
const { query, getClient } = require('../config/database');
const { ensureTables, openConsigned } = require('../utils/consignment');

ensureTables(query).catch(err => console.error('Consignment migration error:', err.message));

const today = () => new Date().toISOString().split('T')[0];

const BASE_SELECT = `
  SELECT c.*,
         (c.qty - c.sold_qty - c.returned_qty)                                AS open_qty,
         p.name, p.brand, p.color, p.serial_number, p.category,
         COALESCE(p.base_cost, 0)                                             AS base_cost,
         COALESCE(p.selling_price, 0)                                         AS selling_price,
         COALESCE(p.base_cost, 0) * (c.qty - c.sold_qty - c.returned_qty)     AS open_cost_value,
         os.name AS owner_shop_name, pt.name AS party_name, pt.phone AS party_phone,
         (SELECT string_agg(DISTINCT si.invoice_number, ', ')
            FROM consignment_events e JOIN sales_invoices si ON si.id = e.invoice_id
           WHERE e.consignment_id = c.id AND e.event_type = 'sold')           AS invoices,
         (SELECT MAX(e.event_date) FROM consignment_events e
           WHERE e.consignment_id = c.id AND e.event_type = 'returned')       AS returned_date
  FROM consignments c
  JOIN products p ON p.id = c.product_id
  JOIN shops os   ON os.id = c.owner_shop_id
  JOIN consignment_parties pt ON pt.id = c.party_id
`;

// GET /consignments?status=open|closed|all&owner_shop_id=&party_id=&search=
router.get('/', async (req, res) => {
  try {
    const { status = 'open', owner_shop_id, party_id, search } = req.query;
    const where = [];
    const params = [];
    if (status === 'open')   where.push('(c.qty - c.sold_qty - c.returned_qty) > 0');
    if (status === 'closed') where.push('(c.qty - c.sold_qty - c.returned_qty) = 0');
    if (owner_shop_id)  { params.push(parseInt(owner_shop_id));  where.push(`c.owner_shop_id = $${params.length}`); }
    if (party_id)       { params.push(party_id);                 where.push(`c.party_id = $${params.length}`); }
    if (search && search.trim()) {
      params.push(`%${search.trim().replace(/\s+/g, '')}%`);
      where.push(`(REPLACE(p.name,' ','') ILIKE $${params.length}
                OR REPLACE(COALESCE(p.brand,''),' ','') ILIKE $${params.length}
                OR COALESCE(p.serial_number,'') ILIKE $${params.length})`);
    }
    const sql = `${BASE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY c.given_date DESC, c.created_at DESC LIMIT 1000`;
    const r = await query(sql, params);
    res.json({ success: true, data: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /consignments/summary — what each owner shop has lying with each party (open stock only)
router.get('/summary', async (req, res) => {
  try {
    const r = await query(`
      SELECT c.owner_shop_id, os.name AS owner_shop_name,
             c.party_id, pt.name AS party_name,
             COUNT(*)::int                                                    AS records,
             SUM(c.qty - c.sold_qty - c.returned_qty)::int                    AS units,
             COALESCE(SUM((c.qty - c.sold_qty - c.returned_qty) * COALESCE(p.base_cost,0)), 0) AS cost_value
      FROM consignments c
      JOIN products p ON p.id = c.product_id
      JOIN shops os   ON os.id = c.owner_shop_id
      JOIN consignment_parties pt ON pt.id = c.party_id
      WHERE c.qty - c.sold_qty - c.returned_qty > 0
      GROUP BY c.owner_shop_id, os.name, c.party_id, pt.name
      ORDER BY os.name, pt.name
    `);
    res.json({ success: true, data: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /consignments/parties — B2B parties (with how much of our stock each one holds)
router.get('/parties', async (req, res) => {
  try {
    const r = await query(`
      SELECT pt.id, pt.name, pt.phone, pt.is_active,
             COALESCE(SUM(c.qty - c.sold_qty - c.returned_qty), 0)::int AS open_units
      FROM consignment_parties pt
      LEFT JOIN consignments c ON c.party_id = pt.id
      WHERE pt.is_active = true
      GROUP BY pt.id
      ORDER BY pt.name
    `);
    res.json({ success: true, data: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /consignments/parties — add a party { name, phone? }
router.post('/parties', async (req, res) => {
  try {
    const name  = (req.body.name || '').trim();
    const phone = (req.body.phone || '').trim() || null;
    if (!name) return res.status(400).json({ success: false, message: 'Party name is required' });
    const dup = await query(
      `SELECT id FROM consignment_parties WHERE LOWER(TRIM(name)) = LOWER($1)`, [name]);
    if (dup.rows.length)
      return res.status(400).json({ success: false, message: `Party "${name}" already exists` });
    const r = await query(
      `INSERT INTO consignment_parties (name, phone) VALUES ($1,$2) RETURNING *`, [name, phone]);
    res.status(201).json({ success: true, data: r.rows[0], message: 'Party added' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /consignments/parties/:id — fix name / phone
router.put('/parties/:id', async (req, res) => {
  try {
    const name  = (req.body.name || '').trim();
    const phone = (req.body.phone || '').trim() || null;
    if (!name) return res.status(400).json({ success: false, message: 'Party name is required' });
    const dup = await query(
      `SELECT id FROM consignment_parties WHERE LOWER(TRIM(name)) = LOWER($1) AND id <> $2`, [name, req.params.id]);
    if (dup.rows.length)
      return res.status(400).json({ success: false, message: `Party "${name}" already exists` });
    const r = await query(
      `UPDATE consignment_parties SET name = $1, phone = $2 WHERE id = $3 RETURNING *`,
      [name, phone, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'Party not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /consignments — give stock of the owner shop to a B2B party
router.post('/', async (req, res) => {
  const client = await getClient();
  try {
    const { product_id, owner_shop_id, party_id, given_date, notes } = req.body;
    const qty = parseInt(req.body.qty);
    const owner  = parseInt(owner_shop_id);
    if (!product_id || !owner || !party_id || !qty || qty <= 0)
      return res.status(400).json({ success: false, message: 'Product, owner shop, party and qty are required' });

    await client.query('BEGIN');

    const prod = await client.query(
      `SELECT id, name, brand, serial_number, is_active, COALESCE(is_service,false) AS is_service
       FROM products WHERE id = $1`, [product_id]);
    if (!prod.rows.length || !prod.rows[0].is_active) throw new Error('Product not found');
    if (prod.rows[0].is_service) throw new Error('A service cannot be given on consignment');
    const hasSerial = !!(prod.rows[0].serial_number && String(prod.rows[0].serial_number).trim());
    if (hasSerial && qty !== 1) throw new Error('This item has an IMEI/serial — quantity must be 1');

    const shops = await client.query(`SELECT id FROM shops WHERE id = $1 AND is_active = true`, [owner]);
    if (!shops.rows.length) throw new Error('Shop not found');
    const party = await client.query(`SELECT id FROM consignment_parties WHERE id = $1 AND is_active = true`, [party_id]);
    if (!party.rows.length) throw new Error('Party not found');

    // lock the owner's inventory row so two people cannot give the same unit twice
    const inv = await client.query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND shop_id = $2 FOR UPDATE`, [product_id, owner]);
    const onHand = inv.rows.length ? parseInt(inv.rows[0].quantity) : 0;
    const open   = await openConsigned(client, product_id, owner);
    const free   = onHand - open;
    if (qty > free) {
      throw new Error(free <= 0
        ? 'No free stock — all units of this item are already on consignment (or out of stock)'
        : `Only ${free} free unit(s) available to give (stock ${onHand}, already on consignment ${open})`);
    }

    const r = await client.query(
      `INSERT INTO consignments (product_id, owner_shop_id, party_id, qty, given_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [product_id, owner, party_id, qty, given_date || today(), notes || null, req.user?.id || null]
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: r.rows[0], message: 'Given on consignment' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// POST /consignments/:id/return — stock comes back (record only; stock never left the owner's inventory)
router.post('/:id/return', async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const r = await client.query(`SELECT * FROM consignments WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const c = r.rows[0];
    if (!c) throw new Error('Consignment record not found');
    const open = c.qty - c.sold_qty - c.returned_qty;
    if (open <= 0) throw new Error('Nothing left to return on this record');
    const qty = req.body.qty ? parseInt(req.body.qty) : open;
    if (!qty || qty <= 0 || qty > open) throw new Error(`Return quantity must be between 1 and ${open}`);

    await client.query(`UPDATE consignments SET returned_qty = returned_qty + $1 WHERE id = $2`, [qty, c.id]);
    await client.query(
      `INSERT INTO consignment_events (consignment_id, event_type, qty, event_date, created_by)
       VALUES ($1,'returned',$2,$3,$4)`,
      [c.id, qty, req.body.return_date || today(), req.user?.id || null]
    );
    await client.query('COMMIT');
    res.json({ success: true, message: `${qty} unit(s) returned` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// DELETE /consignments/:id — cancel a wrongly entered record (only if nothing sold/returned yet)
router.delete('/:id', async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const r = await client.query(`SELECT * FROM consignments WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const c = r.rows[0];
    if (!c) throw new Error('Consignment record not found');
    if (c.sold_qty > 0 || c.returned_qty > 0)
      throw new Error('Cannot cancel — some units are already sold or returned');
    await client.query(`DELETE FROM consignments WHERE id = $1`, [c.id]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Consignment cancelled' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
