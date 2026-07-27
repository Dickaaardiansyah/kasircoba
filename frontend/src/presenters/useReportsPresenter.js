// src/presenters/useReportsPresenter.js
// ─────────────────────────────────────────────────────────────────────────────
// PRESENTER LAYER — Laporan (Keuangan → Laporan). Menyediakan 3 jenis
// laporan agar polanya konsisten dengan Laporan Laba Rugi: user memilih
// jenis laporan lebih dulu (ReportPicker), lalu mengatur filter & melihat
// hasilnya.
//   - penjualan     → Laporan Penjualan: performa penjualan produk
//   - barangMasuk   → Laporan Barang Masuk: rekap pembelian stok dari supplier
//   - barangExpired → Laporan Barang Expired: batch barang mendekati/lewat
//                      tanggal kadaluarsa (per baris pembelian)
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { transactionModel } from "../models/transactionModel";
import { purchaseModel } from "../models/purchaseModel";
import { settingsModel } from "../models/settingsModel";

function defaultStart() {
  return new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
}
function defaultEnd() {
  return new Date().toISOString().split("T")[0];
}

export const REPORT_TYPES = [
  {
    id: "penjualan",
    title: "Laporan Penjualan",
    description: "Analisis performa penjualan produk & pendapatan",
  },
  {
    id: "penjualanPelanggan",
    title: "Laporan Penjualan per Pelanggan",
    description:
      "Rekap pendapatan, HPP, & laba per pelanggan dalam suatu periode",
  },
  {
    id: "labaProduk",
    title: "Laporan Laba per Produk",
    description:
      "Keuntungan tiap barang: pendapatan dikurangi harga beli dari supplier",
  },
  {
    id: "barangMasuk",
    title: "Laporan Barang Masuk",
    description: "Rekap pembelian stok dari supplier per periode",
  },
  {
    id: "barangExpired",
    title: "Laporan Barang Expired",
    description: "Batch barang masuk yang sudah/akan lewat tanggal kadaluarsa",
  },
];

const VALID_TYPES = REPORT_TYPES.map((r) => r.id);

// ── Opsi filter cepat rentang tanggal untuk Laporan Laba per Produk ────────
export const QUICK_RANGE_OPTIONS = [
  { value: "today", label: "Hari Ini", days: 0 },
  { value: "2days", label: "2 Hari Terakhir", days: 1 },
  { value: "7days", label: "7 Hari Terakhir", days: 6 },
  { value: "30days", label: "30 Hari Terakhir", days: 29 },
  { value: "custom", label: "Custom", days: null },
];

export const PROFIT_SORT_OPTIONS = [
  { value: "profit", label: "Laba Terbesar" },
  { value: "revenue", label: "Pendapatan Terbesar" },
  { value: "qty", label: "Qty Terbanyak" },
  { value: "margin", label: "Margin Terbesar" },
  { value: "name", label: "Nama Produk (A-Z)" },
];

function isoToday() {
  return new Date().toISOString().split("T")[0];
}
function rangeFromQuickOption(days) {
  const end = isoToday();
  const start = new Date(Date.now() - days * 86400000)
    .toISOString()
    .split("T")[0];
  return { start, end };
}

// ── Opsi sorting untuk tabel "Produk Terlaris" / "Produk Terbanyak Dibeli" ──
export const SALES_SORT_OPTIONS = [
  { value: "revenue", label: "Pendapatan Terbesar" },
  { value: "qty", label: "Qty Terbanyak" },
  { value: "name", label: "Nama Produk (A-Z)" },
];

export const CUSTOMER_SORT_OPTIONS = [
  { value: "revenue", label: "Pendapatan Terbesar" },
  { value: "profit", label: "Laba Terbesar" },
  { value: "transactions", label: "Transaksi Terbanyak" },
  { value: "name", label: "Nama Pelanggan (A-Z)" },
];

export const PURCHASE_SORT_OPTIONS = [
  { value: "cost", label: "Biaya Terbesar" },
  { value: "qty", label: "Qty Terbanyak" },
  { value: "name", label: "Nama Produk (A-Z)" },
];

export function useReportsPresenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialType = VALID_TYPES.includes(searchParams.get("type"))
    ? searchParams.get("type")
    : null;
  const [reportType, setReportType] = useState(initialType);

  // ── Parameter tiap jenis laporan ────────────────────────────────────────
  const [period, setPeriod] = useState("daily"); // penjualan & barangMasuk
  const [startDate, setStartDate] = useState(defaultStart());
  const [endDate, setEndDate] = useState(defaultEnd());
  const [expiredStatus, setExpiredStatus] = useState(""); // barangExpired: '', expired, soon, safe
  const [thresholdDays, setThresholdDays] = useState(30); // barangExpired
  const [salesSort, setSalesSort] = useState("revenue"); // penjualan: revenue | qty | name
  const [purchaseSort, setPurchaseSort] = useState("cost"); // barangMasuk: cost | qty | name
  const [customerSort, setCustomerSort] = useState("revenue"); // penjualanPelanggan

  // ── labaProduk: filter cepat rentang tanggal (default "Hari Ini") ────────
  const [quickRange, setQuickRange] = useState("today");
  const [profitStartDate, setProfitStartDate] = useState(isoToday());
  const [profitEndDate, setProfitEndDate] = useState(isoToday());
  const [profitSort, setProfitSort] = useState("profit");

  function selectQuickRange(value) {
    setQuickRange(value);
    const opt = QUICK_RANGE_OPTIONS.find((o) => o.value === value);
    if (opt && opt.days !== null) {
      const { start, end } = rangeFromQuickOption(opt.days);
      setProfitStartDate(start);
      setProfitEndDate(end);
    }
  }
  function setProfitStartDateCustom(v) {
    setQuickRange("custom");
    setProfitStartDate(v);
  }
  function setProfitEndDateCustom(v) {
    setQuickRange("custom");
    setProfitEndDate(v);
  }

  // ── Hasil laporan ────────────────────────────────────────────────────────
  const [salesReport, setSalesReport] = useState(null);
  const [purchaseReport, setPurchaseReport] = useState(null);
  const [expiredReport, setExpiredReport] = useState(null);
  const [profitReport, setProfitReport] = useState(null);
  const [customerReport, setCustomerReport] = useState(null);
  const [storeSettings, setStoreSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [metaLoaded, setMetaLoaded] = useState(false);

  useEffect(() => {
    settingsModel
      .get()
      .then((res) => setStoreSettings(res.data || {}))
      .catch(() => {})
      .finally(() => setMetaLoaded(true));
  }, []);

  function selectReportType(id) {
    setReportType(id);
    setSearchParams({ type: id });
  }
  function backToPicker() {
    setReportType(null);
    setSearchParams({});
  }

  const load = useCallback(async () => {
    if (!reportType) return;
    setLoading(true);
    try {
      if (reportType === "penjualan") {
        const res = await transactionModel.getSalesReport({
          period,
          start_date: startDate,
          end_date: endDate,
        });
        setSalesReport(res.data);
      } else if (reportType === "penjualanPelanggan") {
        const res = await transactionModel.getSalesByCustomerReport({
          start_date: startDate,
          end_date: endDate,
        });
        setCustomerReport(res.data);
      } else if (reportType === "barangMasuk") {
        const res = await purchaseModel.getReport({
          period,
          start_date: startDate,
          end_date: endDate,
        });
        setPurchaseReport(res.data);
      } else if (reportType === "barangExpired") {
        const res = await purchaseModel.getExpiredReport({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          status: expiredStatus || undefined,
          threshold_days: thresholdDays,
        });
        setExpiredReport(res.data);
      } else if (reportType === "labaProduk") {
        const res = await transactionModel.getProductProfitReport({
          start_date: profitStartDate,
          end_date: profitEndDate,
        });
        setProfitReport(res.data);
      }
    } catch {
      toast.error("Gagal memuat laporan");
    } finally {
      setLoading(false);
    }
  }, [
    reportType,
    period,
    startDate,
    endDate,
    expiredStatus,
    thresholdDays,
    profitStartDate,
    profitEndDate,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const salesChartData = (salesReport?.salesData || []).map((d) => ({
    period: d.period,
    revenue: Math.round(d.revenue),
    transactions: d.transaction_count,
  }));

  const purchaseChartData = (purchaseReport?.periodData || []).map((d) => ({
    period: d.period,
    cost: Math.round(d.total_cost),
    qty: d.total_qty,
  }));

  // ── Sorting sisi klien untuk tabel produk (data sudah di-fetch, tinggal urut ulang) ──
  const sortedSalesTopProducts = useMemo(() => {
    const arr = [...(salesReport?.topProducts || [])];
    if (salesSort === "qty") arr.sort((a, b) => b.total_qty - a.total_qty);
    else if (salesSort === "name")
      arr.sort((a, b) => a.name.localeCompare(b.name, "id"));
    else arr.sort((a, b) => b.total_revenue - a.total_revenue);
    return arr;
  }, [salesReport, salesSort]);

  const sortedPurchaseTopProducts = useMemo(() => {
    const arr = [...(purchaseReport?.topProducts || [])];
    if (purchaseSort === "qty") arr.sort((a, b) => b.total_qty - a.total_qty);
    else if (purchaseSort === "name")
      arr.sort((a, b) => a.product_name.localeCompare(b.product_name, "id"));
    else arr.sort((a, b) => b.total_cost - a.total_cost);
    return arr;
  }, [purchaseReport, purchaseSort]);

  const sortedProfitProducts = useMemo(() => {
    const arr = [...(profitReport?.items || [])];
    if (profitSort === "revenue")
      arr.sort((a, b) => b.total_revenue - a.total_revenue);
    else if (profitSort === "qty")
      arr.sort((a, b) => b.total_qty - a.total_qty);
    else if (profitSort === "margin")
      arr.sort((a, b) => b.margin_percent - a.margin_percent);
    else if (profitSort === "name")
      arr.sort((a, b) => a.name.localeCompare(b.name, "id"));
    else arr.sort((a, b) => b.total_profit - a.total_profit);
    return arr;
  }, [profitReport, profitSort]);

  const sortedCustomers = useMemo(() => {
    const arr = [...(customerReport?.items || [])];
    if (customerSort === "profit")
      arr.sort((a, b) => b.total_profit - a.total_profit);
    else if (customerSort === "transactions")
      arr.sort((a, b) => b.transaction_count - a.transaction_count);
    else if (customerSort === "name")
      arr.sort((a, b) => a.customer_name.localeCompare(b.customer_name, "id"));
    else arr.sort((a, b) => b.total_revenue - a.total_revenue);
    return arr;
  }, [customerReport, customerSort]);

  return {
    reportTypes: REPORT_TYPES,
    reportType,
    selectReportType,
    backToPicker,

    period,
    setPeriod,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    expiredStatus,
    setExpiredStatus,
    thresholdDays,
    setThresholdDays,
    salesSort,
    setSalesSort,
    purchaseSort,
    setPurchaseSort,
    customerSort,
    setCustomerSort,

    quickRange,
    selectQuickRange,
    profitStartDate,
    setProfitStartDate: setProfitStartDateCustom,
    profitEndDate,
    setProfitEndDate: setProfitEndDateCustom,
    profitSort,
    setProfitSort,

    salesReport,
    purchaseReport,
    expiredReport,
    profitReport,
    customerReport,
    salesChartData,
    purchaseChartData,
    sortedSalesTopProducts,
    sortedPurchaseTopProducts,
    sortedProfitProducts,
    sortedCustomers,
    storeSettings,
    loading: loading || !metaLoaded,
    reload: load,
  };
}
