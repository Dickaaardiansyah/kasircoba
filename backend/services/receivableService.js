// services/receivableService.js
// ─────────────────────────────────────────────────────────────────────────────
// SERVICE LAYER — aturan bisnis Piutang: validasi input, kode faktur otomatis,
// perhitungan status (belum_lunas/sebagian/lunas) dari amount vs paid_amount,
// serta pencatatan pembayaran yang tidak boleh melebihi sisa tagihan.
// ─────────────────────────────────────────────────────────────────────────────
const receivableModel = require("../models/receivableModel");
const transactionModel = require("../models/transactionModel");
const { ValidationError, NotFoundError } = require("./productService");
const journalService = require("./journalService");

function computeStatus(amount, paidAmount) {
  if (paidAmount <= 0) return "belum_lunas";
  if (paidAmount >= amount) return "lunas";
  return "sebagian";
}

function generateInvoiceCode() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PIU-${y}${m}${d}-${rand}`;
}

const receivableService = {
  list({ status, customer_id, search, overdue_only, page, limit }) {
    const params = {
      status,
      customerId: customer_id,
      search,
      overdueOnly: overdue_only === "true",
    };
    if (!limit) return receivableModel.findAll(params);
    const parsedLimit = parseInt(limit) || 20;
    const parsedPage = parseInt(page) || 1;
    return receivableModel.findAll({
      ...params,
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
    });
  },

  async getById(id) {
    const receivable = await receivableModel.findById(id);
    if (!receivable) throw new NotFoundError("Piutang tidak ditemukan");
    const payments = await receivableModel.findPayments(id);

    // Kalau faktur ini berasal dari transaksi Open Bill di Kasir, sertakan
    // juga daftar barang (nama produk, qty, harga) supaya bisa dicek
    // kesesuaiannya dengan yang sebenarnya diambil pelanggan.
    let items = [];
    if (receivable.transaction_id) {
      items = await transactionModel.findItemsByTransactionId(
        receivable.transaction_id,
      );
    }

    return { ...receivable, payments, items };
  },

  async create(payload) {
    const {
      customer_name,
      customer_id,
      amount,
      due_date,
      invoice_date,
      paid_amount,
      notes,
      recorded_by,
      transaction_id,
    } = payload;

    if (!customer_name || !customer_name.trim())
      throw new ValidationError("Nama pelanggan wajib diisi");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0)
      throw new ValidationError("Jumlah piutang harus lebih dari 0");
    if (!due_date) throw new ValidationError("Tanggal jatuh tempo wajib diisi");

    const paid = parseFloat(paid_amount) || 0;
    if (paid > amt)
      throw new ValidationError(
        "Jumlah dibayar tidak boleh melebihi jumlah piutang",
      );

    const invoiceCode = generateInvoiceCode();
    const invoiceDate = invoice_date || new Date().toISOString().slice(0, 10);
    const status = computeStatus(amt, paid);

    const result = await receivableModel.create({
      invoiceCode,
      customerId: customer_id || null,
      customerName: customer_name.trim(),
      transactionId: transaction_id || null,
      amount: amt,
      paidAmount: paid,
      invoiceDate,
      dueDate: due_date,
      status,
      notes,
      recordedBy: recorded_by,
    });
    return receivableModel.findById(result.insertId);
  },

  async remove(id) {
    const existing = await receivableModel.findById(id);
    if (!existing) throw new NotFoundError("Piutang tidak ditemukan");
    await receivableModel.remove(id);
  },

  async recordPayment(id, payload) {
    const receivable = await receivableModel.findById(id);
    if (!receivable) throw new NotFoundError("Piutang tidak ditemukan");

    const amt = parseFloat(payload.amount);
    if (!amt || amt <= 0)
      throw new ValidationError("Jumlah pembayaran harus lebih dari 0");

    const sisa =
      parseFloat(receivable.amount) - parseFloat(receivable.paid_amount);
    if (amt > sisa + 0.01)
      throw new ValidationError(
        `Jumlah pembayaran melebihi sisa piutang (sisa: Rp ${sisa.toLocaleString("id-ID")})`,
      );

    const newPaidAmount = parseFloat(receivable.paid_amount) + amt;
    const newStatus = computeStatus(
      parseFloat(receivable.amount),
      newPaidAmount,
    );
    const paymentDate =
      payload.payment_date || new Date().toISOString().slice(0, 10);

    await receivableModel.addPayment(
      id,
      {
        amount: amt,
        paymentDate,
        paymentMethod: payload.payment_method,
        notes: payload.notes,
        recordedBy: payload.recorded_by,
      },
      newPaidAmount,
      newStatus,
    );

    // Posting jurnal otomatis (Dr Kas/Bank, Cr Piutang Usaha) — best-effort,
    // sama seperti pola postSaleJournal: kegagalan di sini TIDAK membatalkan
    // pembayaran yang sudah tersimpan.
    try {
      await journalService.postReceivablePaymentJournal(
        {
          amount: amt,
          payment_date: paymentDate,
          payment_method: payload.payment_method,
          recorded_by: payload.recorded_by,
        },
        receivable,
      );
    } catch (journalError) {
      console.error(
        "Gagal posting jurnal pembayaran piutang:",
        journalError.message,
      );
    }

    return receivableModel.findById(id);
  },

  // ─── Laporan ─────────────────────────────────────────────────────────────
  // customerId opsional — dipakai untuk drill-down "Menu Open Bill: pilih
  // pelanggan → daftar tagihan pelanggan tsb".
  unpaidInvoices(customerId) {
    return receivableModel
      .findAll({ status: null, customerId: customerId || null })
      .then((rows) => rows.filter((r) => r.status !== "lunas"));
  },
  unpaidByCustomer() {
    return receivableModel.unpaidGroupedByCustomer();
  },
  aging() {
    return receivableModel.agingReport();
  },
  history({ start_date, end_date, customer_id }) {
    return receivableModel.history({
      startDate: start_date,
      endDate: end_date,
      customerId: customer_id,
    });
  },
  summary() {
    return receivableModel.summary();
  },
};

module.exports = receivableService;
