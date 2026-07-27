// src/presenters/usePayablesPresenter.js
// ─────────────────────────────────────────────────────────────────────────────
// PRESENTER LAYER — mirror dari useReceivablesPresenter.js, untuk halaman
// Hutang. Menghubungkan dengan payableModel & purchaseModel (daftar supplier).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { payableModel } from "../models/payableModel";
import { purchaseModel } from "../models/purchaseModel";
import { settingsModel } from "../models/settingsModel";
import { printBuktiHutang } from "../utils/printBuktiHutang";

export function usePayablesPresenter() {
  const [tab, setTab] = useState("unpaid"); // unpaid | per_supplier | aging | history
  const [search, setSearch] = useState("");
  const [suppliers, setSuppliers] = useState([]);

  const [unpaid, setUnpaid] = useState([]);
  const [perSupplier, setPerSupplier] = useState([]);
  const [aging, setAging] = useState([]);
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);

  const [historyStart, setHistoryStart] = useState("");
  const [historyEnd, setHistoryEnd] = useState("");
  const [historySupplier, setHistorySupplier] = useState("");

  const [loading, setLoading] = useState(true);
  const [storeSettings, setStoreSettings] = useState({});

  // Detail & Riwayat Pembayaran berbagi satu fetch (payableModel.getById
  // sudah menyertakan payments + items barang pembelian jika ada), hanya
  // beda mode tampilan di modal-nya. Lihat PayableDetailModal di Utang.jsx.
  const [detail, setDetail] = useState(null); // record lengkap hasil getById
  const [detailMode, setDetailMode] = useState(null); // 'detail' | 'history' | null
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    settingsModel
      .get()
      .then((r) => setStoreSettings(r.data || {}))
      .catch(() => {});
  }, []);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await purchaseModel.listSuppliers();
      setSuppliers(res.data);
    } catch {
      /* silent — dropdown tetap kosong kalau gagal */
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const res = await payableModel.getSummary();
      setSummary(res.data);
    } catch {
      /* summary bersifat opsional untuk header */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "unpaid") {
        const res = await payableModel.getUnpaid();
        setUnpaid(res.data);
      } else if (tab === "per_supplier") {
        const res = await payableModel.getUnpaidPerSupplier();
        setPerSupplier(res.data);
      } else if (tab === "aging") {
        const res = await payableModel.getAging();
        setAging(res.data);
      } else if (tab === "history") {
        const res = await payableModel.getHistory({
          start_date: historyStart,
          end_date: historyEnd,
          supplier_id: historySupplier,
        });
        setHistory(res.data);
      }
    } catch (e) {
      toast.error(e.message || "Gagal memuat data hutang");
    } finally {
      setLoading(false);
    }
  }, [tab, historyStart, historyEnd, historySupplier]);

  useEffect(() => {
    loadSuppliers();
    loadSummary();
  }, [loadSuppliers, loadSummary]);

  useEffect(() => {
    load();
  }, [load]);

  async function removePayable(payable) {
    if (!window.confirm(`Hapus faktur hutang "${payable.invoice_code}"?`))
      return;
    try {
      await payableModel.remove(payable.id);
      toast.success("Hutang berhasil dihapus");
      load();
      loadSummary();
    } catch (e) {
      toast.error(e.message || "Gagal menghapus hutang");
    }
  }

  async function fetchDetail(payable, mode) {
    setDetailMode(mode);
    setDetailLoading(true);
    try {
      const res = await payableModel.getById(payable.id);
      setDetail(res.data);
    } catch (e) {
      toast.error(e.message || "Gagal memuat detail hutang");
      setDetailMode(null);
    } finally {
      setDetailLoading(false);
    }
  }

  // Aksi "Detail" — faktur + daftar barang pembelian (jika ada).
  function openDetail(payable) {
    fetchDetail(payable, "detail");
  }

  // Aksi "Lihat Riwayat Pembayaran" — daftar cicilan/pembayaran faktur ini.
  function openHistory(payable) {
    fetchDetail(payable, "history");
  }

  function closeDetail() {
    setDetail(null);
    setDetailMode(null);
  }

  // Aksi "Cetak Bukti" — ambil data terbaru (termasuk riwayat pembayaran),
  // lalu cetak lewat window.print() (lihat utils/printBuktiHutang.js).
  async function printBukti(payable) {
    try {
      const res = await payableModel.getById(payable.id);
      printBuktiHutang(res.data, storeSettings);
    } catch (e) {
      toast.error(e.message || "Gagal menyiapkan bukti hutang");
    }
  }

  const filteredUnpaid = search
    ? unpaid.filter(
        (p) =>
          p.invoice_code.toLowerCase().includes(search.toLowerCase()) ||
          p.supplier_name.toLowerCase().includes(search.toLowerCase()),
      )
    : unpaid;

  return {
    tab,
    setTab,
    search,
    setSearch,
    suppliers,
    unpaid: filteredUnpaid,
    perSupplier,
    aging,
    history,
    summary,
    historyStart,
    setHistoryStart,
    historyEnd,
    setHistoryEnd,
    historySupplier,
    setHistorySupplier,
    loading,
    reload: () => {
      load();
      loadSummary();
    },
    removePayable,
    detail,
    detailMode,
    detailLoading,
    openDetail,
    openHistory,
    closeDetail,
    printBukti,
  };
}

export function usePayableFormPresenter({ suppliers, onSuccess, onClose }) {
  const [form, setForm] = useState({
    supplier_id: "",
    supplier_name: "",
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

  function selectSupplier(supplierId) {
    const s = suppliers.find((s) => String(s.id) === String(supplierId));
    setForm((f) => ({
      ...f,
      supplier_id: supplierId,
      supplier_name: s ? s.name : f.supplier_name,
    }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.supplier_name.trim()) {
      toast.error("Nama pemasok wajib diisi");
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Jumlah hutang harus lebih dari 0");
      return;
    }
    if (!form.due_date) {
      toast.error("Tanggal jatuh tempo wajib diisi");
      return;
    }
    setSaving(true);
    try {
      await payableModel.create(form);
      toast.success("Hutang berhasil dicatat");
      onSuccess();
      onClose();
    } catch (e2) {
      toast.error(e2.message || "Gagal mencatat hutang");
    } finally {
      setSaving(false);
    }
  }

  return { form, setField, selectSupplier, saving, submit };
}

export function usePayablePaymentPresenter({ payable, onSuccess, onClose }) {
  const sisa = payable
    ? Number(payable.amount) - Number(payable.paid_amount)
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
      await payableModel.recordPayment(payable.id, form);
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
