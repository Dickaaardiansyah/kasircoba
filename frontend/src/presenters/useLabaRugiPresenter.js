// src/presenters/useLabaRugiPresenter.js
// ─────────────────────────────────────────────────────────────────────────────
// PRESENTER LAYER — Laporan Laba Rugi & manajemen biaya operasional.
// Menghubungkan View (LabaRugi.jsx) dengan Model (accountingModel).
//
// Mendukung 5 jenis laporan laba rugi agar user mudah memilih laporan yang
// sesuai kebutuhannya (meniru pola "pilih jenis laporan" pada software
// akuntansi seperti Accurate/Jurnal):
//   - standard      → Laba/Rugi (Standar): satu periode bebas
//   - multiYear     → Laba/Rugi (Multi Year): per tahun, 2–5 tahun terakhir
//   - quarterly     → Laba/Rugi (Kuartal): per kuartal dalam 1 tahun
//   - multiPeriod   → Laba/Rugi (Multi Periode): per bulan dalam rentang bebas
//   - comparison    → Laba/Rugi (Perbandingan Periode): 2 periode + variance
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { accountingModel } from "../models/accountingModel";
import { settingsModel } from "../models/settingsModel";

function firstDayOfThisMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}
function today() {
  return new Date().toISOString().split("T")[0];
}
function currentYear() {
  return new Date().getFullYear();
}

export const EMPTY_EXPENSE_FORM = {
  expense_date: today(),
  category: "lainnya",
  description: "",
  amount: "",
};

export const REPORT_TYPES = [
  {
    id: "standard",
    title: "Laba/Rugi (Standar)",
    description: "Menampilkan laporan laba rugi untuk periode yg dipilih",
  },
  {
    id: "multiYear",
    title: "Laba/Rugi (Multi Year)",
    description:
      "Menampilkan laba rugi per akhir tahun pada rentang periode beberapa tahun terakhir",
  },
  {
    id: "quarterly",
    title: "Laba/Rugi (Kuartal)",
    description: "Menampilkan laba rugi kuartal pada tahun yang dipilih",
  },
  {
    id: "multiPeriod",
    title: "Laba/Rugi (Multi Periode)",
    description: "Menampilkan laba rugi bulanan pada rentang periode terpilih",
  },
  {
    id: "comparison",
    title: "Laba/Rugi (Perbandingan Periode)",
    description:
      "Menampilkan laba rugi dibandingkan dengan periode lalu, selisihnya ditampilkan dengan persentase",
  },
];

const VALID_REPORT_TYPES = REPORT_TYPES.map((r) => r.id);

export function useLabaRugiPresenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialType = VALID_REPORT_TYPES.includes(searchParams.get("type"))
    ? searchParams.get("type")
    : null;

  const [tab, setTab] = useState("statement"); // statement | expenses
  const [reportType, setReportType] = useState(initialType); // null = tampilkan pemilihan laporan

  // ── Parameter tiap jenis laporan (independen agar tidak saling menimpa) ──
  const [startDate, setStartDate] = useState(firstDayOfThisMonth()); // standard
  const [endDate, setEndDate] = useState(today());
  const [multiYearEndYear, setMultiYearEndYear] = useState(currentYear()); // multiYear
  const [multiYearSpan, setMultiYearSpan] = useState(3);
  const [quarterlyYear, setQuarterlyYear] = useState(currentYear()); // quarterly
  const [multiPeriodStart, setMultiPeriodStart] = useState(
    firstDayOfThisMonth(),
  ); // multiPeriod
  const [multiPeriodEnd, setMultiPeriodEnd] = useState(today());
  const [period1Start, setPeriod1Start] = useState(firstDayOfThisMonth()); // comparison
  const [period1End, setPeriod1End] = useState(today());
  const [period2Start, setPeriod2Start] = useState(firstDayOfThisMonth());
  const [period2End, setPeriod2End] = useState(today());

  // ── Hasil laporan ──────────────────────────────────────────────────────
  const [statement, setStatement] = useState(null); // standard
  const [multiYearReport, setMultiYearReport] = useState(null);
  const [quarterlyReport, setQuarterlyReport] = useState(null);
  const [multiPeriodReport, setMultiPeriodReport] = useState(null);
  const [comparisonReport, setComparisonReport] = useState(null);

  const [trend, setTrend] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [storeSettings, setStoreSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [metaLoaded, setMetaLoaded] = useState(false);

  // Data pendukung yang selalu dibutuhkan (kategori biaya, pengaturan toko, tren)
  const loadMeta = useCallback(async () => {
    try {
      const [trendRes, categoryRes, settingsRes] = await Promise.all([
        accountingModel.getMonthlyTrend(),
        accountingModel.getExpenseCategories(),
        settingsModel.get(),
      ]);
      setTrend(trendRes.data);
      setCategories(categoryRes.data);
      setStoreSettings(settingsRes.data || {});
    } catch (e) {
      toast.error(e.message || "Gagal memuat data pendukung laporan");
    } finally {
      setMetaLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const loadExpenses = useCallback(async () => {
    try {
      const res = await accountingModel.listExpenses({ startDate, endDate });
      setExpenses(res.data);
    } catch (e) {
      toast.error(e.message || "Gagal memuat biaya operasional");
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (tab === "expenses") loadExpenses();
  }, [tab, loadExpenses]);

  // Memuat laporan sesuai jenis yang sedang aktif
  const loadReport = useCallback(async () => {
    if (!reportType) return;
    setLoading(true);
    try {
      if (reportType === "standard") {
        const res = await accountingModel.getIncomeStatement({
          start_date: startDate,
          end_date: endDate,
        });
        setStatement(res.data);
      } else if (reportType === "multiYear") {
        const res = await accountingModel.getMultiYearIncomeStatement({
          years: multiYearSpan,
          end_year: multiYearEndYear,
        });
        setMultiYearReport(res.data);
      } else if (reportType === "quarterly") {
        const res = await accountingModel.getQuarterlyIncomeStatement({
          year: quarterlyYear,
        });
        setQuarterlyReport(res.data);
      } else if (reportType === "multiPeriod") {
        const res = await accountingModel.getMultiPeriodIncomeStatement({
          start_date: multiPeriodStart,
          end_date: multiPeriodEnd,
        });
        setMultiPeriodReport(res.data);
      } else if (reportType === "comparison") {
        const res = await accountingModel.getComparisonIncomeStatement({
          period1_start: period1Start,
          period1_end: period1End,
          period2_start: period2Start,
          period2_end: period2End,
        });
        setComparisonReport(res.data);
      }
    } catch (e) {
      toast.error(e.message || "Gagal memuat laporan laba rugi");
    } finally {
      setLoading(false);
    }
  }, [
    reportType,
    startDate,
    endDate,
    multiYearSpan,
    multiYearEndYear,
    quarterlyYear,
    multiPeriodStart,
    multiPeriodEnd,
    period1Start,
    period1End,
    period2Start,
    period2End,
  ]);

  useEffect(() => {
    if (tab === "statement") loadReport();
  }, [tab, loadReport]);

  function selectReportType(id) {
    setReportType(id);
    setSearchParams({ type: id });
  }
  function backToPicker() {
    setReportType(null);
    setSearchParams({});
  }

  async function createExpense(payload) {
    try {
      await accountingModel.createExpense(payload);
      toast.success("Biaya operasional dicatat");
      loadExpenses();
      if (reportType === "standard") loadReport();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    }
  }

  async function updateExpense(id, payload) {
    try {
      await accountingModel.updateExpense(id, payload);
      toast.success("Biaya operasional diperbarui");
      loadExpenses();
      if (reportType === "standard") loadReport();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    }
  }

  async function removeExpense(expense) {
    if (
      !confirm(
        `Hapus catatan biaya "${expense.description || expense.category}"?`,
      )
    )
      return;
    try {
      await accountingModel.removeExpense(expense.id);
      toast.success("Biaya operasional dihapus");
      loadExpenses();
      if (reportType === "standard") loadReport();
    } catch (e) {
      toast.error(e.message);
    }
  }

  const trendChartData = trend.map((t) => ({
    month: t.month,
    Pendapatan: t.revenue,
    HPP: t.cogs,
    "Laba Kotor": t.gross_profit,
  }));

  return {
    tab,
    setTab,
    reportType,
    selectReportType,
    backToPicker,
    reportTypes: REPORT_TYPES,

    startDate,
    setStartDate,
    endDate,
    setEndDate,
    multiYearEndYear,
    setMultiYearEndYear,
    multiYearSpan,
    setMultiYearSpan,
    quarterlyYear,
    setQuarterlyYear,
    multiPeriodStart,
    setMultiPeriodStart,
    multiPeriodEnd,
    setMultiPeriodEnd,
    period1Start,
    setPeriod1Start,
    period1End,
    setPeriod1End,
    period2Start,
    setPeriod2Start,
    period2End,
    setPeriod2End,

    statement,
    multiYearReport,
    quarterlyReport,
    multiPeriodReport,
    comparisonReport,

    trend,
    trendChartData,
    expenses,
    categories,
    storeSettings,
    loading: loading || !metaLoaded,
    createExpense,
    updateExpense,
    removeExpense,
    reload: loadReport,
  };
}
