// src/controllers/purchasesController.js
// Business Logic: Creates purchase → purchase_items → inventory_stock → supplier_ledger

const { query, getClient } = require('../config/database');

// Generate purchase number: PUR-2024-001
async function generatePurchaseNumber() {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COUNT(*) as count FROM purchases WHERE EXTRACT(YEAR FROM purchase_date) = $1`,
    [year]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `PUR-${year}-${String(count).padStart(3, '0')}`;
}

// GET /api/v1/purchases
exports.getAllPurchases = async (req, res) => {
  try {
    const result = await query(`
      SELECT p.*, s.name as supplier_name,
             COUNT(pi.id) as item_count
      FROM purchases p
      JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
      GROUP BY p.id, s.name
      ORDER BY p.purchase_date DESC, p.created_at DESC
    `);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/purchases/:id
exports.getPurchase = async (req, res) => {
  try {
    const purchase = await query(
      `SELECT p.*, s.name as supplier_name, s.phone as supplier_phone
       FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!purchase.rows.length) return res.status(404).json({ success: false, message: 'Purchase not found' });

    const items = await query(
      `SELECT pi.*, pr.name as product_name, pr.brand, pr.model
       FROM purchase_items pi JOIN products pr ON pr.id = pi.product_id
       WHERE pi.purchase_id = $1`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...purchase.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/purchases
// Body: { supplier_id, purchase_date, amount_paid, notes, items: [{product_id, imei, qty, unit_cost}] }
exports.createPurchase = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { supplier_id, purchase_date, amount_paid = 0, notes, items } = req.body;

    // Validation
    if (!supplier_id) throw new Error('supplier_id is required');
    if (!items || !items.length) throw new Error('At least one purchase item is required');

    // Calculate total
    const totalAmount = items.reduce((sum, item) => sum + (item.qty * item.unit_cost), 0);
    const purchaseNumber = await generatePurchaseNumber();

    // 1. Create purchase header
    const purchase = await client.query(
      `INSERT INTO purchases (purchase_number, supplier_id, purchase_date, total_amount, amount_paid, payment_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        purchaseNumber, supplier_id, purchase_date || new Date().toISOString().split('T')[0],
        totalAmount, amount_paid,
        amount_paid >= totalAmount ? 'paid' : amount_paid > 0 ? 'partial' : 'unpaid',
        notes
      ]
    );
    const purchaseId = purchase.rows[0].id;

    // 2. Create purchase items + inventory stock lines
    for (const item of items) {
      if (!item.product_id || !item.unit_cost) throw new Error('Each item needs product_id and unit_cost');
      
      // Insert purchase item
      const piResult = await client.query(
        `INSERT INTO purchase_items (purchase_id, product_id, imei, qty, unit_cost, recommended_selling_price)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id

        [purchaseId, item.product_id, item.imei, item.qty || 1, item.unit_cost, item.recommended_selling_price || 0]

      );

            // ✅ Update inventory quantity
      await client.query(
        `INSERT INTO inventory (product_id, quantity, min_stock)
         VALUES ($1, $2, 5)
         ON CONFLICT (product_id)
         DO UPDATE SET
           quantity     = inventory.quantity + $2,
           last_updated = NOW()`,
        [item.product_id, item.qty || 1]
      );
    }

    // 3. Update supplier balance (we owe them the amount_due)
    const amountDue = totalAmount - amount_paid;
    
    // Get current supplier balance
    const supplier = await client.query('SELECT balance FROM suppliers WHERE id = $1', [supplier_id]);
    const newBalance = parseFloat(supplier.rows[0].balance) + amountDue;

    await client.query('UPDATE suppliers SET balance = $1 WHERE id = $2', [newBalance, supplier_id]);

    // 4. Log in supplier_ledger
    await client.query(
      `INSERT INTO supplier_ledger (supplier_id, transaction_type, reference_id, reference_type, amount, balance_after, description, transaction_date)
       VALUES ($1, 'purchase', $2, 'purchase', $3, $4, $5, $6)`,
      [
        supplier_id, purchaseId, amountDue, newBalance,
        `Purchase ${purchaseNumber} - ${items.length} item(s)`,
        purchase_date || new Date().toISOString().split('T')[0]
      ]
    );

    // If amount_paid > 0, also log payment
    if (amount_paid > 0) {
      const balanceAfterPayment = newBalance - amount_paid;
      await client.query(
        `INSERT INTO supplier_ledger (supplier_id, transaction_type, reference_id, reference_type, amount, balance_after, description, transaction_date)
         VALUES ($1, 'payment', $2, 'purchase', $3, $4, $5, $6)`,
        [
          supplier_id, purchaseId, -amount_paid, balanceAfterPayment,
          `Payment with purchase ${purchaseNumber}`,
          purchase_date || new Date().toISOString().split('T')[0]
        ]
      );
    }

    await client.query('COMMIT');

    // Return full purchase
    const created = await query(
      `SELECT p.*, s.name as supplier_name FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = $1`,
      [purchaseId]
    );

    res.status(201).json({
      success: true,
      message: `Purchase ${purchaseNumber} created successfully`,
      data: created.rows[0],
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Purchase creation failed:', err.message);
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

// POST /api/v1/purchases/:id/pay - record a payment to supplier
exports.recordPayment = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { amount, payment_date, notes } = req.body;
    if (!amount || amount <= 0) throw new Error('Valid payment amount required');

    const purchase = await client.query('SELECT * FROM purchases WHERE id = $1', [req.params.id]);
    if (!purchase.rows.length) throw new Error('Purchase not found');

    const p = purchase.rows[0];
    const newAmountPaid = parseFloat(p.amount_paid) + parseFloat(amount);
    if (newAmountPaid > parseFloat(p.total_amount)) throw new Error('Payment exceeds total amount');

    const paymentStatus = newAmountPaid >= p.total_amount ? 'paid' : 'partial';

    // Update purchase
    await client.query(
      `UPDATE purchases SET amount_paid = $1, payment_status = $2 WHERE id = $3`,
      [newAmountPaid, paymentStatus, req.params.id]
    );

    // Update supplier balance
    const supplier = await client.query('SELECT balance FROM suppliers WHERE id = $1', [p.supplier_id]);
    const newSupplierBalance = parseFloat(supplier.rows[0].balance) - parseFloat(amount);
    await client.query('UPDATE suppliers SET balance = $1 WHERE id = $2', [newSupplierBalance, p.supplier_id]);

    // Log in ledger
    await client.query(
      `INSERT INTO supplier_ledger (supplier_id, transaction_type, reference_id, reference_type, amount, balance_after, description, transaction_date)
       VALUES ($1, 'payment', $2, 'purchase', $3, $4, $5, $6)`,
      [p.supplier_id, p.id, -amount, newSupplierBalance, notes || `Payment for ${p.purchase_number}`, payment_date || new Date().toISOString().split('T')[0]]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Payment recorded successfully', new_balance: newSupplierBalance });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};
