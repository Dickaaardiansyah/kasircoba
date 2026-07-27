// src/presenters/useTransactionsPresenter.js
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { transactionModel } from "../models/transactionModel";
import { settingsModel } from "../models/settingsModel";
import { printReceiptSmart } from "../utils/printReceipt";
import { usePrinterContext } from "../context/PrinterContext";
import { toDateKey } from "../utils/format";

// YYYY-MM-DD sesuai zona waktu lokal perangkat (bukan toISOString yang UTC,
// supaya tanggal "hari ini" tidak meleset jadi kemarin/besok dekat tengah malam).
function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Riwayat dikelompokkan per hari (lihat groupedByDate di bawah), jadi tidak
// memakai pagination halaman-per-halaman — cukup ambil sekaligus dalam
// jumlah besar per kueri filter.
const FETCH_LIMIT = 1000;

export function useTransactionsPresenter() {
  // Drill-down dari Dashboard (mis. klik kartu "Pendapatan Bulan Ini") datang
  // lewat query param ?start_date=&end_date= — kalau ada, langsung dipakai
  // sebagai filter awal (mode "custom") alih-alih default "Hari Ini".
  const [searchParams] = useSearchParams();
  const drillStart = searchParams.get("start_date");
  const drillEnd = searchParams.get("end_date");
  const hasDrillDown = !!(drillStart || drillEnd);

  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({
    total_transactions: 0,
    total_revenue: 0,
  });
  const [loading, setLoading] = useState(true);
  // Filter cepat: "today" (Hari Ini), "all" (Semua), "custom" (rentang tanggal manual).
  const [quickFilter, setQuickFilter] = useState(
    hasDrillDown ? "custom" : "today",
  );
  const [startDate, setStartDate] = useState(
    drillStart || drillEnd || todayStr(),
  );
  const [endDate, setEndDate] = useState(drillEnd || drillStart || todayStr());
  const [paymentMethod, setPaymentMethod] = useState("");
  const [selected, setSelected] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [storeSettings, setStoreSettings] = useState({});
  // Grup tanggal yang disembunyikan (collapsed). Default: semua grup terbuka.
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());

  const printer = usePrinterContext();

  useEffect(() => {
    settingsModel
      .get()
      .then((r) => setStoreSettings(r.data || {}))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await transactionModel.list({
        start_date: startDate,
        end_date: endDate,
        payment_method: paymentMethod,
        page: 1,
        limit: FETCH_LIMIT,
      });
      setTransactions(res.data);
      setTotal(res.total);
      setSummary(
        res.summary || { total_transactions: res.total, total_revenue: 0 },
      );
    } catch {
      toast.error("Gagal memuat transaksi");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, paymentMethod]);

  useEffect(() => {
    load();
  }, [load]);

  // Mengelompokkan transaksi (yang sudah terurut terbaru → terlama dari
  // backend) per tanggal lokal, masing-masing dengan total & jumlah transaksi
  // hari itu — sesuai tampilan referensi.
  const groupedByDate = useMemo(() => {
    const map = new Map();
    for (const tx of transactions) {
      const key = toDateKey(tx.created_at);
      if (!map.has(key)) {
        map.set(key, {
          dateKey: key,
          date: tx.created_at,
          transactions: [],
          total: 0,
        });
      }
      const group = map.get(key);
      group.transactions.push(tx);
      group.total += Number(tx.final_amount) || 0;
    }
    return Array.from(map.values()).sort((a, b) =>
      a.dateKey < b.dateKey ? 1 : -1,
    );
  }, [transactions]);

  function toggleGroup(dateKey) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }

  function changeQuickFilter(mode) {
    setQuickFilter(mode);
    if (mode === "today") {
      setStartDate(todayStr());
      setEndDate(todayStr());
    } else if (mode === "all") {
      setStartDate("");
      setEndDate("");
    } else if (mode === "custom") {
      // Beri default rentang supaya input tanggal tidak kosong saat pertama
      // kali beralih ke mode custom.
      setStartDate((d) => d || todayStr());
      setEndDate((d) => d || todayStr());
    }
  }

  async function viewDetail(id) {
    setLoadingDetail(true);
    try {
      const res = await transactionModel.getById(id);
      setSelected(res.data);
    } catch {
      toast.error("Gagal memuat detail transaksi");
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeDetail() {
    setSelected(null);
  }

  async function printReceipt(transaction) {
    await printReceiptSmart(transaction, storeSettings, printer);
  }

  function resetFilters() {
    // "Reset" kembali ke kondisi default (hari ini), bukan mengosongkan
    // tanggal — supaya tabel tidak mendadak menampilkan seluruh riwayat.
    changeQuickFilter("today");
    setPaymentMethod("");
  }

  return {
    transactions,
    total,
    summary,
    loading,
    quickFilter,
    startDate,
    endDate,
    paymentMethod,
    selected,
    loadingDetail,
    printer,
    storeSettings,
    groupedByDate,
    collapsedGroups,
    toggleGroup,
    setQuickFilter: changeQuickFilter,
    setStartDate,
    setEndDate,
    setPaymentMethod,
    viewDetail,
    closeDetail,
    resetFilters,
    reload: load,
    printReceipt,
  };
}
