// models/transactionModel.js
// ─────────────────────────────────────────────────────────────────────────────
// MODEL LAYER — akses data untuk transaksi penjualan & itemnya.
// Menyimpan snapshot cost_price di setiap item agar laporan Laba Rugi (HPP)
// tetap akurat walau harga modal produk berubah di kemudian hari.
// ─────────────────────────────────────────────────────────────────────────────
const { query, queryOne, transaction } = require("../config/database");

// Menentukan harga satuan yang benar-benar dipakai untuk suatu item: OTOMATIS
// berdasarkan jumlah beli dibanding min_qty_wholesale produk — bukan lagi
// pilihan manual kasir. Begitu quantity mencapai/melewati min_qty_wholesale
// DAN produk itu punya harga grosir, harga grosir otomatis dipakai. Kalau
// produk tidak punya harga grosir atau jumlah belum cukup, tetap pakai
// harga eceran. price_type yang DICATAT mengikuti harga yang benar-benar
// dipakai, supaya laporan tetap akurat.
function resolveItemPrice(product, quantity) {
  const wholesale = parseFloat(product.price_wholesale);
  const minQty = parseInt(product.min_qty_wholesale, 10);
  if (wholesale > 0 && minQty > 0 && Number(quantity) >= minQty) {
    return { unitPrice: wholesale, priceType: "wholesale" };
  }
  return { unitPrice: parseFloat(product.price), priceType: "retail" };
}

const transactionModel = {
  /**
   * Menjalankan seluruh proses checkout dalam satu transaksi DB:
   * validasi stok, kunci baris produk, insert header + item, update stok,
   * catat riwayat stok. `items` = [{ product_id, quantity }]
   */
  async createSale({
    items,
    paymentMethod,
    paymentAmount,
    customerName,
    customerId,
    cashierName,
    discountAmount,
    notes,
    transactionCode,
    occurredAt,
    openBill, // { invoiceCode, dueDate, invoiceDate } — hanya diisi jika paymentMethod === 'open_bill'
  }) {
    return transaction(async (conn) => {
      const productCache = {};
      for (const item of items) {
        const [rows] = await conn.execute(
          "SELECT * FROM products WHERE id = ? AND is_active = 1 FOR UPDATE",
          [item.product_id],
        );
        const product = rows[0];
        if (!product)
          throw new Error(`Produk ID ${item.product_id} tidak ditemukan`);
        if (product.stock < item.quantity) {
          throw new Error(
            `Stok ${product.name} tidak mencukupi. Tersedia: ${product.stock}`,
          );
        }
        productCache[item.product_id] = product;
      }

      let totalAmount = 0;
      for (const item of items) {
        const { unitPrice } = resolveItemPrice(
          productCache[item.product_id],
          item.quantity,
        );
        totalAmount += unitPrice * item.quantity;
      }

      const discount = parseFloat(discountAmount) || 0;
      const finalAmount = totalAmount - discount;
      const isOpenBill = paymentMethod === "open_bill";

      // Open Bill: pembayaran di kasir bersifat DP (boleh 0 s/d total, sisanya
      // jadi piutang). Metode lain: harus dibayar lunas di kasir seperti biasa.
      const paid = isOpenBill
        ? Math.min(parseFloat(paymentAmount) || 0, finalAmount)
        : parseFloat(paymentAmount) || finalAmount;
      const change = isOpenBill ? 0 : paid - finalAmount;
      if (!isOpenBill && paid < finalAmount)
        throw new Error("Jumlah pembayaran kurang dari total");
      if (isOpenBill && parseFloat(paymentAmount) > finalAmount)
        throw new Error("Jumlah DP tidak boleh melebihi total tagihan");
      if (isOpenBill && !customerName)
        throw new Error("Pelanggan wajib dipilih untuk transaksi Open Bill");

      const [txResult] = await conn.execute(
        `INSERT INTO transactions
           (transaction_code, total_amount, discount_amount, tax_amount, final_amount,
            payment_method, payment_amount, change_amount, customer_name, customer_id, cashier_name, notes, status, created_at)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
        [
          transactionCode,
          totalAmount,
          discount,
          finalAmount,
          paymentMethod || "cash",
          paid,
          change,
          customerName || "",
          customerId || null,
          cashierName || "Kasir",
          notes || "",
          occurredAt,
        ],
      );

      const transactionId = txResult.insertId;
      const insertedItems = [];

      for (const item of items) {
        const product = productCache[item.product_id];
        const { unitPrice, priceType } = resolveItemPrice(
          product,
          item.quantity,
        );
        const subtotal = unitPrice * item.quantity;
        const newStock = product.stock - item.quantity;

        await conn.execute(
          `INSERT INTO transaction_items
             (transaction_id, product_id, product_name, product_barcode, quantity, unit_price, price_type, unit_cost, discount, subtotal, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            transactionId,
            product.id,
            product.name,
            product.barcode,
            item.quantity,
            unitPrice,
            priceType,
            product.cost_price,
            subtotal,
            occurredAt,
          ],
        );

        await conn.execute("UPDATE products SET stock = ? WHERE id = ?", [
          newStock,
          product.id,
        ]);

        await conn.execute(
          `INSERT INTO stock_history (product_id, type, quantity, previous_stock, new_stock, reference, notes, created_by)
           VALUES (?, 'out', ?, ?, ?, ?, 'Terjual', ?)`,
          [
            product.id,
            item.quantity,
            product.stock,
            newStock,
            transactionCode,
            cashierName || "Kasir",
          ],
        );

        insertedItems.push({
          product_id: product.id,
          product_name: product.name,
          product_barcode: product.barcode,
          quantity: item.quantity,
          unit_price: unitPrice,
          price_type: priceType,
          unit_cost: parseFloat(product.cost_price || 0),
          subtotal,
          unit: product.unit || "pcs",
        });
      }

      let receivable = null;
      if (isOpenBill && openBill) {
        // Sisa piutang = total tagihan - DP yang sudah dibayar di kasir.
        // Faktur langsung masuk ke daftar Open Bill (Piutang), tertaut ke
        // transaction_id ini, dalam transaksi DB yang sama dengan penjualan
        // & pengurangan stok — supaya tidak ada faktur yang "hilang" kalau
        // salah satu langkah gagal.
        const status =
          paid >= finalAmount ? "lunas" : paid > 0 ? "sebagian" : "belum_lunas";
        const [recResult] = await conn.execute(
          `INSERT INTO receivables
             (invoice_code, customer_id, customer_name, transaction_id, amount, paid_amount,
              invoice_date, due_date, status, notes, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            openBill.invoiceCode,
            customerId || null,
            customerName,
            transactionId,
            finalAmount,
            paid,
            openBill.invoiceDate,
            openBill.dueDate,
            status,
            `Open Bill dari transaksi ${transactionCode}`,
            cashierName || "Kasir",
          ],
        );
        receivable = {
          id: recResult.insertId,
          invoice_code: openBill.invoiceCode,
          amount: finalAmount,
          paid_amount: paid,
          due_date: openBill.dueDate,
          status,
        };
      }

      return {
        id: transactionId,
        transaction_code: transactionCode,
        total_amount: totalAmount,
        discount_amount: discount,
        tax_amount: 0,
        final_amount: finalAmount,
        payment_method: paymentMethod || "cash",
        payment_amount: paid,
        change_amount: change,
        customer_name: customerName || "",
        customer_id: customerId || null,
        cashier_name: cashierName || "Kasir",
        notes: notes || "",
        status: "completed",
        receivable,
        created_at: occurredAt,
        items: insertedItems,
      };
    });
  },

  // Riwayat Transaksi TIDAK menampilkan transaksi Open Bill — transaksi ini
  // sudah punya tempatnya sendiri di halaman Piutang/Open Bill (tabel
  // receivables), jadi tidak perlu dobel muncul di daftar riwayat transaksi
  // biasa. Transaksi tetap tersimpan penuh di tabel `transactions` (stok,
  // jurnal, dsb tetap jalan seperti biasa) — hanya query LIST ini yang
  // menyaringnya keluar.
  findAll({ startDate, endDate, paymentMethod, limit, offset }) {
    let where =
      "WHERE t.status = 'completed' AND t.payment_method != 'open_bill'";
    const params = [];
    if (startDate) {
      where += " AND DATE(t.created_at) >= ?";
      params.push(startDate);
    }
    if (endDate) {
      where += " AND DATE(t.created_at) <= ?";
      params.push(endDate);
    }
    if (paymentMethod) {
      where += " AND t.payment_method = ?";
      params.push(paymentMethod);
    }

    return Promise.all([
      query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(t.final_amount), 0) AS total_revenue
         FROM transactions t ${where}`,
        params,
      ).then((r) => ({
        total: r[0]?.total || 0,
        totalRevenue: Number(r[0]?.total_revenue || 0),
      })),
      query(
        `SELECT * FROM transactions t ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
    ]).then(([{ total, totalRevenue }, rows]) => ({
      total,
      totalRevenue,
      rows,
    }));
  },

  findById(id) {
    return queryOne("SELECT * FROM transactions WHERE id = ?", [id]);
  },

  findItemsByTransactionId(id) {
    return query(
      `SELECT ti.*, p.unit FROM transaction_items ti LEFT JOIN products p ON ti.product_id = p.id WHERE ti.transaction_id = ?`,
      [id],
    );
  },

  // ─── Laporan penjualan ──────────────────────────────────────────────────
  salesGroupedByPeriod(period, startDate, endDate) {
    const groupExpr =
      period === "weekly"
        ? "DATE_FORMAT(t.created_at, '%Y-W%u')"
        : period === "monthly"
          ? "DATE_FORMAT(t.created_at, '%Y-%m')"
          : "DATE(t.created_at)";
    return query(
      `SELECT ${groupExpr} AS period,
              COUNT(DISTINCT t.id)   AS transaction_count,
              SUM(t.final_amount)    AS revenue,
              AVG(t.final_amount)    AS avg_transaction,
              SUM(t.discount_amount) AS total_discount,
              SUM(t.payment_method = 'cash')  AS cash_count,
              SUM(t.payment_method = 'debit') AS debit_count,
              SUM(t.payment_method = 'qris')  AS qris_count
       FROM transactions t
       WHERE DATE(t.created_at) BETWEEN ? AND ? AND t.status = 'completed'
       GROUP BY ${groupExpr} ORDER BY period ASC`,
      [startDate, endDate],
    );
  },

  topProducts(startDate, endDate, limit = 20) {
    return query(
      `SELECT p.name, p.barcode, COALESCE(c.name,'Lainnya') AS category,
              SUM(ti.quantity) AS total_qty, SUM(ti.subtotal) AS total_revenue
       FROM transaction_items ti
       JOIN products p ON ti.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       JOIN transactions t ON ti.transaction_id = t.id
       WHERE DATE(t.created_at) BETWEEN ? AND ? AND t.status = 'completed'
       GROUP BY p.id ORDER BY total_revenue DESC LIMIT ?`,
      [startDate, endDate, limit],
    );
  },

  revenueByCategory(startDate, endDate) {
    return query(
      `SELECT COALESCE(c.name,'Lainnya') AS category, SUM(ti.subtotal) AS revenue, SUM(ti.quantity) AS qty
       FROM transaction_items ti
       JOIN products p ON ti.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       JOIN transactions t ON ti.transaction_id = t.id
       WHERE DATE(t.created_at) BETWEEN ? AND ? AND t.status = 'completed'
       GROUP BY c.id ORDER BY revenue DESC`,
      [startDate, endDate],
    );
  },

  salesSummary(startDate, endDate) {
    return queryOne(
      `SELECT COUNT(*) AS total_transactions, SUM(final_amount) AS total_revenue,
              AVG(final_amount) AS avg_transaction, MAX(final_amount) AS max_transaction,
              MIN(final_amount) AS min_transaction, SUM(discount_amount) AS total_discount
       FROM transactions WHERE DATE(created_at) BETWEEN ? AND ? AND status = 'completed'`,
      [startDate, endDate],
    );
  },

  // Total qty item terjual pada rentang tanggal — dipakai untuk menghitung
  // rata-rata jumlah item per transaksi (bukan rata-rata nominal Rupiah).
  itemsQtySummary(startDate, endDate) {
    return queryOne(
      `SELECT COALESCE(SUM(ti.quantity), 0) AS total_items_qty
       FROM transaction_items ti
       JOIN transactions t ON ti.transaction_id = t.id
       WHERE DATE(t.created_at) BETWEEN ? AND ? AND t.status = 'completed'`,
      [startDate, endDate],
    );
  },

  // ─── Laporan Penjualan berdasarkan Pelanggan ───────────────────────────
  // Semua transaksi tanpa pelanggan terdaftar (customer_id NULL — dijual ke
  // pelanggan umum/walk-in) digabung jadi satu baris "Pelanggan Umum",
  // supaya tidak pecah jadi banyak baris hanya karena nama yang diketik
  // kasir berbeda-beda. Pelanggan yang tercatat (customer_id terisi)
  // dikelompokkan per ID, bukan per nama, supaya tetap akurat walau nama
  // pelanggan diubah di kemudian hari.
  salesByCustomer(startDate, endDate) {
    return query(
      `SELECT
          CASE WHEN t.customer_id IS NULL THEN 0 ELSE t.customer_id END AS customer_id,
          CASE WHEN t.customer_id IS NULL THEN 'Pelanggan Umum' ELSE MAX(t.customer_name) END AS customer_name,
          COUNT(*) AS transaction_count,
          SUM(t.final_amount) AS total_revenue,
          SUM(t.discount_amount) AS total_discount,
          AVG(t.final_amount) AS avg_transaction,
          MAX(t.created_at) AS last_transaction_at
       FROM transactions t
       WHERE DATE(t.created_at) BETWEEN ? AND ? AND t.status = 'completed'
       GROUP BY CASE WHEN t.customer_id IS NULL THEN 0 ELSE t.customer_id END
       ORDER BY total_revenue DESC`,
      [startDate, endDate],
    );
  },

  // Qty & HPP per pelanggan — query terpisah dari salesByCustomer supaya
  // JOIN ke transaction_items (satu transaksi bisa banyak item) tidak
  // menggandakan SUM(final_amount) dkk. pada query header di atas.
  cogsByCustomer(startDate, endDate) {
    return query(
      `SELECT
          CASE WHEN t.customer_id IS NULL THEN 0 ELSE t.customer_id END AS customer_id,
          COALESCE(SUM(ti.quantity), 0) AS total_qty,
          COALESCE(SUM(ti.unit_cost * ti.quantity), 0) AS total_cogs
       FROM transaction_items ti
       JOIN transactions t ON ti.transaction_id = t.id
       WHERE DATE(t.created_at) BETWEEN ? AND ? AND t.status = 'completed'
       GROUP BY CASE WHEN t.customer_id IS NULL THEN 0 ELSE t.customer_id END`,
      [startDate, endDate],
    );
  },

  // ─── Laba per Produk — rincian keuntungan (pendapatan - HPP) per produk ───
  // HPP di sini memakai unit_cost yang tersimpan sebagai snapshot di setiap
  // transaction_items, yaitu harga modal (harga beli dari supplier) produk
  // pada saat transaksi terjadi — sehingga laporan tetap akurat walaupun
  // harga modal produk berubah di kemudian hari.
  profitByProduct(startDate, endDate) {
    return query(
      `SELECT p.id AS product_id, p.name, p.barcode, COALESCE(c.name,'Lainnya') AS category,
              SUM(ti.quantity) AS total_qty,
              SUM(ti.subtotal) AS total_revenue,
              SUM(ti.unit_cost * ti.quantity) AS total_cogs,
              SUM(ti.subtotal) - SUM(ti.unit_cost * ti.quantity) AS total_profit
       FROM transaction_items ti
       JOIN products p ON ti.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       JOIN transactions t ON ti.transaction_id = t.id
       WHERE DATE(t.created_at) BETWEEN ? AND ? AND t.status = 'completed'
       GROUP BY p.id ORDER BY total_profit DESC`,
      [startDate, endDate],
    );
  },

  // ─── HPP (Harga Pokok Penjualan / COGS) untuk periode tertentu ─────────────
  costOfGoodsSold(startDate, endDate) {
    return queryOne(
      `SELECT COALESCE(SUM(ti.unit_cost * ti.quantity), 0) AS total_cogs,
              COALESCE(SUM(ti.quantity), 0) AS total_units_sold
       FROM transaction_items ti
       JOIN transactions t ON ti.transaction_id = t.id
       WHERE DATE(t.created_at) BETWEEN ? AND ? AND t.status = 'completed'`,
      [startDate, endDate],
    );
  },

  // ─── Dashboard ──────────────────────────────────────────────────────────
  dashboardToday() {
    return queryOne(`SELECT COALESCE(COUNT(*),0) AS tx_count, COALESCE(SUM(final_amount),0) AS revenue
                      FROM transactions WHERE DATE(created_at) = CURDATE() AND status = 'completed'`);
  },
  dashboardYesterday() {
    return queryOne(`SELECT COALESCE(COUNT(*),0) AS tx_count, COALESCE(SUM(final_amount),0) AS revenue
                      FROM transactions WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND status = 'completed'`);
  },
  dashboardThisMonth() {
    return queryOne(`SELECT COALESCE(COUNT(*),0) AS tx_count, COALESCE(SUM(final_amount),0) AS revenue
                      FROM transactions WHERE YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW()) AND status = 'completed'`);
  },
  // Minggu berjalan (Senin–Minggu, mengikuti standar ISO/lokal Indonesia).
  dashboardThisWeek() {
    return queryOne(`SELECT COALESCE(COUNT(*),0) AS tx_count, COALESCE(SUM(final_amount),0) AS revenue
                      FROM transactions
                      WHERE YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) AND status = 'completed'`);
  },
  dashboardLast7Days() {
    return query(`SELECT DATE(created_at) AS date, COALESCE(COUNT(*),0) AS tx_count, COALESCE(SUM(final_amount),0) AS revenue
                   FROM transactions WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND status = 'completed'
                   GROUP BY DATE(created_at) ORDER BY date ASC`);
  },
  // Riwayat pendapatan/transaksi harian untuk rentang N hari terakhir — dipakai
  // oleh selector rentang waktu pada grafik dashboard (mis. 7/14/30 hari).
  dashboardRevenueHistory(days) {
    const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;
    return query(
      `SELECT DATE(created_at) AS date, COALESCE(COUNT(*),0) AS tx_count, COALESCE(SUM(final_amount),0) AS revenue
       FROM transactions WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) AND status = 'completed'
       GROUP BY DATE(created_at) ORDER BY date ASC`,
      [safeDays],
    );
  },
  // Riwayat pendapatan/transaksi harian untuk rentang tanggal BEBAS (custom
  // range, tahun tertentu, dsb) — dipakai oleh filter tanggal fleksibel pada
  // dashboard (beda dengan dashboardRevenueHistory yang selalu N hari terakhir
  // dari hari ini).
  revenueHistoryRange(startDate, endDate) {
    return query(
      `SELECT DATE(created_at) AS date, COALESCE(COUNT(*),0) AS tx_count, COALESCE(SUM(final_amount),0) AS revenue
       FROM transactions WHERE DATE(created_at) BETWEEN ? AND ? AND status = 'completed'
       GROUP BY DATE(created_at) ORDER BY date ASC`,
      [startDate, endDate],
    );
  },
};

module.exports = transactionModel;
