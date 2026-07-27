// src/presenters/useCashRegisterPresenter.js
// ─────────────────────────────────────────────────────────────────────────────
// PRESENTER LAYER — menghubungkan View (CashRegister.jsx) dengan Model
// (cashRegisterModel). Menangani: status sesi kas aktif, buka kas, catat
// cash in/out, tutup kas (rekonsiliasi selisih), dan riwayat sesi.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { cashRegisterModel } from "../models/cashRegisterModel";
import { useAuth } from "../context/AuthContext";
import { useShift } from "../context/ShiftContext";

export function useCashRegisterPresenter() {
  const { user } = useAuth();
  const [tab, setTab] = useState("kas"); // kas | riwayat

  // ─── Sesi kas aktif — didelegasikan ke ShiftContext supaya status shift
  // konsisten dengan Sidebar & halaman Kasir tanpa fetch berulang. ─────────
  const {
    shift,
    loading,
    reload,
    opening,
    openShift,
    closing,
    closeShift,
    closeResult,
    setCloseResult,
  } = useShift();

  const [cashOutCategories, setCashOutCategories] = useState([]);
  const [cashInCategories, setCashInCategories] = useState([]);

  useEffect(() => {
    cashRegisterModel
      .getCashOutCategories()
      .then((res) => setCashOutCategories(res.data))
      .catch(() => {});
    cashRegisterModel
      .getCashInCategories()
      .then((res) => setCashInCategories(res.data))
      .catch(() => {});
  }, []);

  // ─── Catat pengeluaran/pemasukan kas ───────────────────────────────────
  const [movementSubmitting, setMovementSubmitting] = useState(false);

  async function addMovement({ type, category, amount, description }) {
    if (!category) {
      toast.error("Pilih kategori terlebih dahulu");
      return false;
    }
    if (!amount || Number(amount) <= 0) {
      toast.error("Jumlah harus lebih dari 0");
      return false;
    }
    setMovementSubmitting(true);
    try {
      const res = await cashRegisterModel.createMovement({
        type,
        category,
        amount: Number(amount),
        description,
        created_by: user?.name || "Admin",
      });
      reload();
      toast.success(
        type === "out" ? "Pengeluaran kas tercatat" : "Pemasukan kas tercatat",
      );
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setMovementSubmitting(false);
    }
  }

  async function deleteMovement(id) {
    try {
      await cashRegisterModel.deleteMovement(id);
      reload();
      toast.success("Catatan kas dihapus");
    } catch (e) {
      toast.error(e.message);
    }
  }

  // ─── Riwayat sesi kas ───────────────────────────────────────────────────
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedHistory, setSelectedHistory] = useState(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await cashRegisterModel.history({
        page: historyPage,
        limit: 20,
      });
      setHistory(res.data);
      setHistoryTotal(res.total);
    } catch {
      toast.error("Gagal memuat riwayat tutup kas");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage]);

  useEffect(() => {
    if (tab === "riwayat") loadHistory();
  }, [tab, loadHistory]);

  async function viewHistoryDetail(id) {
    try {
      const res = await cashRegisterModel.getById(id);
      setSelectedHistory(res.data);
    } catch {
      toast.error("Gagal memuat detail sesi kas");
    }
  }

  return {
    tab,
    setTab,
    shift,
    loading,
    cashOutCategories,
    cashInCategories,
    reload,

    opening,
    openShift,

    movementSubmitting,
    addMovement,
    deleteMovement,

    closing,
    closeShift,
    closeResult,
    setCloseResult,

    history,
    historyTotal,
    historyPage,
    setHistoryPage,
    historyLoading,
    selectedHistory,
    setSelectedHistory,
    viewHistoryDetail,
  };
}
