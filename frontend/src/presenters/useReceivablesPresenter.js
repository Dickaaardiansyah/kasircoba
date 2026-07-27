// src/presenters/useReceivablesPresenter.js
// ─────────────────────────────────────────────────────────────────────────────
// PRESENTER LAYER — menghubungkan halaman Piutang dengan receivableModel &
// customerModel. Mengelola tab laporan aktif, data tiap laporan, serta form
// pencatatan piutang baru dan pencatatan pembayaran.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { receivableModel } from "../models/receivableModel";
import { customerModel } from "../models/customerModel";

export function useReceivablesPresenter() {
  const [tab, setTab] = useState("unpaid"); // unpaid | per_customer | aging | history
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState([]);

  const [unpaid, setUnpaid] = useState([]);
  const [perCustomer, setPerCustomer] = useState([]);
  const [aging, setAging] = useState([]);
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);

  // ── Drill-down "Menu Open Bill": pilih pelanggan → daftar tagihan pelanggan itu
  const [selectedCustomer, setSelectedCustomer] = useState(null); // { customer_id, customer_name }
  const [customerInvoices, setCustomerInvoices] = useState([]);
  const [loadingCustomerInvoices, setLoadingCustomerInvoices] = useState(false);

  const [historyStart, setHistoryStart] = useState("");
  const [historyEnd, setHistoryEnd] = useState("");
  const [historyCustomer, setHistoryCustomer] = useState("");

  const [loading, setLoading] = useState(true);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await customerModel.getAll({});
      setCustomers(res.data);
    } catch {
      /* silent — dropdown tetap kosong kalau gagal */
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const res = await receivableModel.getSummary();
      setSummary(res.data);
    } catch {
      /* summary bersifat opsional untuk header */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "unpaid") {
        const res = await receivableModel.getUnpaid();
        setUnpaid(res.data);
      } else if (tab === "per_customer") {
        const res = await receivableModel.getUnpaidPerCustomer();
        setPerCustomer(res.data);
      } else if (tab === "aging") {
        const res = await receivableModel.getAging();
        setAging(res.data);
      } else if (tab === "history") {
        const res = await receivableModel.getHistory({
          start_date: historyStart,
          end_date: historyEnd,
          customer_id: historyCustomer,
        });
        setHistory(res.data);
      }
    } catch (e) {
      toast.error(e.message || "Gagal memuat data piutang");
    } finally {
      setLoading(false);
    }
  }, [tab, historyStart, historyEnd, historyCustomer]);

  useEffect(() => {
    loadCustomers();
    loadSummary();
  }, [loadCustomers, loadSummary]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset drill-down setiap kali pindah tab supaya tidak "nyangkut" di daftar
  // tagihan pelanggan lain saat balik ke tab per-pelanggan.
  useEffect(() => {
    setSelectedCustomer(null);
    setCustomerInvoices([]);
  }, [tab]);

  const openCustomerInvoices = useCallback(async (customer) => {
    setSelectedCustomer(customer);
    setLoadingCustomerInvoices(true);
    try {
      const res = await receivableModel.getUnpaid({
        customer_id: customer.customer_id,
      });
      setCustomerInvoices(res.data);
    } catch (e) {
      toast.error(e.message || "Gagal memuat tagihan pelanggan");
    } finally {
      setLoadingCustomerInvoices(false);
    }
  }, []);

  const closeCustomerInvoices = useCallback(() => {
    setSelectedCustomer(null);
    setCustomerInvoices([]);
  }, []);

  const reloadCustomerInvoices = useCallback(() => {
    if (selectedCustomer) openCustomerInvoices(selectedCustomer);
  }, [selectedCustomer, openCustomerInvoices]);

  async function removeReceivable(receivable) {
    if (!window.confirm(`Hapus faktur piutang "${receivable.invoice_code}"?`))
      return;
    try {
      await receivableModel.remove(receivable.id);
      toast.success("Piutang berhasil dihapus");
      load();
      loadSummary();
    } catch (e) {
      toast.error(e.message || "Gagal menghapus piutang");
    }
  }

  const filteredUnpaid = search
    ? unpaid.filter(
        (r) =>
          r.invoice_code.toLowerCase().includes(search.toLowerCase()) ||
          r.customer_name.toLowerCase().includes(search.toLowerCase()),
      )
    : unpaid;

  return {
    tab,
    setTab,
    search,
    setSearch,
    customers,
    unpaid: filteredUnpaid,
    perCustomer,
    aging,
    history,
    summary,
    historyStart,
    setHistoryStart,
    historyEnd,
    setHistoryEnd,
    historyCustomer,
    setHistoryCustomer,
    loading,
    reload: () => {
      load();
      loadSummary();
    },
    removeReceivable,
    // ── drill-down per pelanggan (Open Bill)
    selectedCustomer,
    customerInvoices,
    loadingCustomerInvoices,
    openCustomerInvoices,
    closeCustomerInvoices,
    reloadCustomerInvoices,
  };
}

export function useReceivableFormPresenter({ customers, onSuccess, onClose }) {
  const [form, setForm] = useState({
    customer_id: "",
    customer_name: "",
    amount: "",
    paid_amount: "0",
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function selectCustomer(customerId) {
    const c = customers.find((c) => String(c.id) === String(customerId));
    setForm((f) => ({
      ...f,
      customer_id: customerId,
      customer_name: c ? c.name : f.customer_name,
    }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.customer_name.trim()) {
      toast.error("Nama pelanggan wajib diisi");
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Jumlah piutang harus lebih dari 0");
      return;
    }
    if (!form.due_date) {
      toast.error("Tanggal jatuh tempo wajib diisi");
      return;
    }
    setSaving(true);
    try {
      await receivableModel.create(form);
      toast.success("Piutang berhasil dicatat");
      onSuccess();
      onClose();
    } catch (e2) {
      toast.error(e2.message || "Gagal mencatat piutang");
    } finally {
      setSaving(false);
    }
  }

  return { form, setField, selectCustomer, saving, submit };
}

export function useReceivablePaymentPresenter({
  receivable,
  onSuccess,
  onClose,
}) {
  const sisa = receivable
    ? Number(receivable.amount) - Number(receivable.paid_amount)
    : 0;
  const [form, setForm] = useState({
    amount: sisa > 0 ? String(sisa) : "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: "cash",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Jumlah pembayaran harus lebih dari 0");
      return;
    }
    setSaving(true);
    try {
      await receivableModel.recordPayment(receivable.id, form);
      toast.success("Pembayaran berhasil dicatat");
      onSuccess();
      onClose();
    } catch (e2) {
      toast.error(e2.message || "Gagal mencatat pembayaran");
    } finally {
      setSaving(false);
    }
  }

  return { form, setField, saving, submit, sisa };
}
