// models/cashRegisterModel.js
// ─────────────────────────────────────────────────────────────────────────────
// MODEL LAYER — modul Kas Kecil: sesi kas (cash_shifts) dan pergerakan kas
// insidental (cash_movements). Query mentah saja; aturan bisnis (validasi,
// perhitungan selisih, dsb.) hidup di services/cashRegisterService.js.
// ─────────────────────────────────────────────────────────────────────────────
const { query, queryOne, insert, execute } = require("../config/database");

const cashRegisterModel = {
  // ─── Sesi kas (shift) ───────────────────────────────────────────────────
  findActiveShift() {
    return queryOne(
      "SELECT * FROM cash_shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1",
    );
  },

  findShiftById(id) {
    return queryOne("SELECT * FROM cash_shifts WHERE id = ?", [id]);
  },

  createShift({
    shiftCode,
    openingBalance,
    openingNotes,
    openedBy,
    occurredAt,
  }) {
    return insert(
      `INSERT INTO cash_shifts
         (shift_code, opening_balance, opening_notes, opened_by, opened_at, status)
       VALUES (?, ?, ?, ?, ?, 'open')`,
      [
        shiftCode,
        openingBalance,
        openingNotes || "",
        openedBy || "Admin",
        occurredAt,
      ],
    );
  },

  closeShift(
    id,
    {
      closingBalanceSystem,
      closingBalancePhysical,
      difference,
      totalCashSales,
      totalCashIn,
      totalCashOut,
      closingNotes,
      closedBy,
      occurredAt,
    },
  ) {
    return execute(
      `UPDATE cash_shifts SET
         closing_balance_system = ?, closing_balance_physical = ?, difference = ?,
         total_cash_sales = ?, total_cash_in = ?, total_cash_out = ?,
         closing_notes = ?, closed_by = ?, closed_at = ?, status = 'closed'
       WHERE id = ?`,
      [
        closingBalanceSystem,
        closingBalancePhysical,
        difference,
        totalCashSales,
        totalCashIn,
        totalCashOut,
        closingNotes || "",
        closedBy || "Admin",
        occurredAt,
        id,
      ],
    );
  },

  findShiftHistory({ startDate, endDate, limit = 20, offset = 0 } = {}) {
    const params = [];
    let where = "WHERE status = 'closed'";
    if (startDate) {
      where += " AND DATE(opened_at) >= ?";
      params.push(startDate);
    }
    if (endDate) {
      where += " AND DATE(opened_at) <= ?";
      params.push(endDate);
    }

    return Promise.all([
      queryOne(`SELECT COUNT(*) AS total FROM cash_shifts ${where}`, params),
      query(
        `SELECT * FROM cash_shifts ${where} ORDER BY opened_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
    ]).then(([totalRow, rows]) => ({
      total: Number(totalRow?.total || 0),
      rows,
    }));
  },

  // ─── Pergerakan kas (cash in / cash out) ────────────────────────────────
  findMovementsByShift(shiftId) {
    return query(
      "SELECT * FROM cash_movements WHERE shift_id = ? ORDER BY created_at DESC, id DESC",
      [shiftId],
    );
  },

  findMovementById(id) {
    return queryOne("SELECT * FROM cash_movements WHERE id = ?", [id]);
  },

  createMovement({
    shiftId,
    type,
    category,
    amount,
    description,
    createdBy,
    occurredAt,
  }) {
    return insert(
      `INSERT INTO cash_movements
         (shift_id, type, category, amount, description, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        shiftId,
        type,
        category,
        amount,
        description || "",
        createdBy || "Admin",
        occurredAt,
      ],
    );
  },

  deleteMovement(id) {
    return execute("DELETE FROM cash_movements WHERE id = ?", [id]);
  },

  sumMovements(shiftId) {
    return query(
      `SELECT type, COALESCE(SUM(amount),0) AS total
       FROM cash_movements WHERE shift_id = ? GROUP BY type`,
      [shiftId],
    );
  },

  // Total penjualan tunai (cash) selama rentang shift berjalan/berakhir —
  // dasar perhitungan "saldo kas seharusnya" saat tutup kas.
  sumCashSales(openedAt, closedAt) {
    if (closedAt) {
      return queryOne(
        `SELECT COALESCE(SUM(final_amount),0) AS total_cash_sales
         FROM transactions
         WHERE payment_method = 'cash' AND status = 'completed'
           AND created_at BETWEEN ? AND ?`,
        [openedAt, closedAt],
      );
    }
    return queryOne(
      `SELECT COALESCE(SUM(final_amount),0) AS total_cash_sales
       FROM transactions
       WHERE payment_method = 'cash' AND status = 'completed'
         AND created_at >= ?`,
      [openedAt],
    );
  },
};

module.exports = cashRegisterModel;
