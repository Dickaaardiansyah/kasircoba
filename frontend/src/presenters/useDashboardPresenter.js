// src/presenters/useDashboardPresenter.js
import { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import { transactionModel } from "../models/transactionModel";
import { accountingModel } from "../models/accountingModel";
import { settingsModel } from "../models/settingsModel";
import { formatShortDate } from "../utils/format";

function pad(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function today() {
  return toISODate(new Date());
}
function firstDayOfThisMonth() {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

// ── Filter tanggal fleksibel untuk dashboard ────────────────────────────────
// Menggantikan selector 7/14/30 hari lama dengan opsi yang lebih lengkap:
// preset cepat, tahun tertentu (termasuk tahun-tahun lalu), dan rentang
// tanggal custom bebas.
export const DASHBOARD_FILTER_OPTIONS = [
  { value: "today", label: "Hari Ini" },
  { value: "7days", label: "7 Hari" },
  { value: "30days", label: "30 Hari" },
  { value: "thisMonth", label: "Bulan Ini" },
  { value: "year", label: "Tahun" },
  { value: "custom", label: "Custom" },
];

function currentYear() {
  return new Date().getFullYear();
}

// Tahun yang bisa dipilih di dropdown "Tahun" — tahun berjalan + 4 tahun ke belakang.
export function availableYears() {
  const y = currentYear();
  return [y, y - 1, y - 2, y - 3, y - 4];
}

function rangeForFilter(filterMode, { year, customStart, customEnd }) {
  const t = today();
  switch (filterMode) {
    case "today":
      return { start: t, end: t, label: "Hari Ini" };
    case "7days":
      return {
        start: toISODate(new Date(Date.now() - 6 * 86400000)),
        end: t,
        label: "7 Hari Terakhir",
      };
    case "30days":
      return {
        start: toISODate(new Date(Date.now() - 29 * 86400000)),
        end: t,
        label: "30 Hari Terakhir",
      };
    case "year": {
      const y = year || currentYear();
      const isCurrentYear = y === currentYear();
      return {
        start: `${y}-01-01`,
        end: isCurrentYear ? t : `${y}-12-31`,
        label: `Tahun ${y}`,
      };
    }
    case "custom":
      return {
        start: customStart || firstDayOfThisMonth(),
        end: customEnd || t,
        label: "Rentang Custom",
      };
    case "thisMonth":
    default:
      return { start: firstDayOfThisMonth(), end: t, label: "Bulan Ini" };
  }
}

export function useDashboardPresenter() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Filter tanggal fleksibel (menentukan grafik, top produk, beban,
  //    ringkasan laba rugi, dan data ekspor) ──────────────────────────────
  const [filterMode, setFilterMode] = useState("thisMonth");
  const [selectedYear, setSelectedYear] = useState(currentYear());
  const [customStart, setCustomStart] = useState(firstDayOfThisMonth());
  const [customEnd, setCustomEnd] = useState(today());

  const range = useMemo(
    () =>
      rangeForFilter(filterMode, {
        year: selectedYear,
        customStart,
        customEnd,
      }),
    [filterMode, selectedYear, customStart, customEnd],
  );

  const [periodSummary, setPeriodSummary] = useState(null);
  const [loadingPeriod, setLoadingPeriod] = useState(true);
  const [incomeStatement, setIncomeStatement] = useState(null);
  const [loadingIncome, setLoadingIncome] = useState(true);
  const [storeSettings, setStoreSettings] = useState({});

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await transactionModel.getDashboardSummary();
      setSummary(res.data);
    } catch {
      toast.error("Gagal memuat dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPeriodSummary = useCallback(async () => {
    setLoadingPeriod(true);
    try {
      const res = await transactionModel.getDashboardPeriodSummary({
        start_date: range.start,
        end_date: range.end,
      });
      setPeriodSummary(res.data);
    } catch {
      toast.error("Gagal memuat data periode terpilih");
    } finally {
      setLoadingPeriod(false);
    }
  }, [range.start, range.end]);

  const loadIncomeStatement = useCallback(async () => {
    setLoadingIncome(true);
    try {
      const res = await accountingModel.getIncomeStatement({
        start_date: range.start,
        end_date: range.end,
      });
      setIncomeStatement(res.data);
    } catch {
      // Ringkasan laba rugi bersifat pelengkap — gagal diam-diam, jangan ganggu dashboard utama
    } finally {
      setLoadingIncome(false);
    }
  }, [range.start, range.end]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadPeriodSummary();
    loadIncomeStatement();
  }, [loadPeriodSummary, loadIncomeStatement]);

  useEffect(() => {
    settingsModel
      .get()
      .then((res) => setStoreSettings(res.data || {}))
      .catch(() => {});
  }, []);

  function refresh() {
    loadSummary();
    loadPeriodSummary();
    loadIncomeStatement();
  }

  const todayRevenuePct =
    summary?.yesterday?.revenue > 0
      ? (
          ((summary.today.revenue - summary.yesterday.revenue) /
            summary.yesterday.revenue) *
          100
        ).toFixed(1)
      : null;
  const todayTxPct =
    summary?.yesterday?.tx_count > 0
      ? (
          ((summary.today.tx_count - summary.yesterday.tx_count) /
            summary.yesterday.tx_count) *
          100
        ).toFixed(1)
      : null;

  const chartSource = periodSummary?.revenueHistory || [];
  const chartData = chartSource.map((d) => ({
    date: formatShortDate(d.date),
    revenue: Math.round(d.revenue),
    tx: d.tx_count,
  }));

  return {
    summary,
    loading,

    // Filter tanggal fleksibel
    filterMode,
    setFilterMode,
    selectedYear,
    setSelectedYear,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    range,

    periodSummary,
    loadingPeriod,
    chartData,
    todayRevenuePct,
    todayTxPct,
    incomeStatement,
    loadingIncome,
    storeSettings,
    refresh,
  };
}
