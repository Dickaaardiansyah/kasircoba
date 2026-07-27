// src/presenters/useJournalPresenter.js
// ─────────────────────────────────────────────────────────────────────────────
// PRESENTER LAYER — menghubungkan View (Journal.jsx) dengan Model
// (journalModel). Menangani 4 sub-halaman: Chart of Accounts, Jurnal Umum
// (riwayat + input manual), Buku Besar (per akun), dan Neraca Saldo.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { journalModel } from "../models/journalModel";
import { capitalModel } from "../models/capitalModel";
import { useAuth } from "../context/AuthContext";

function today() {
  return new Date().toISOString().split("T")[0];
}

export function useJournalPresenter() {
  const [tab, setTab] = useState("jurnal"); // coa | jurnal | buku-besar | neraca | arus-kas | modal

  // ─── Chart of Accounts ────────────────────────────────────────────────
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const res = await journalModel.getAccounts();
      setAccounts(res.data);
    } catch {
      toast.error("Gagal memuat Chart of Accounts");
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  async function createAccount(payload) {
    try {
      await journalModel.createAccount(payload);
      toast.success("Akun berhasil dibuat");
      loadAccounts();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    }
  }

  // ─── Jurnal Umum ─────────────────────────────────────────────────────────
  const [entries, setEntries] = useState([]);
  const [entriesTotal, setEntriesTotal] = useState(0);
  const [entriesPage, setEntriesPage] = useState(1);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [referenceTypeFilter, setReferenceTypeFilter] = useState("");
  const [selectedEntry, setSelectedEntry] = useState(null);

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    try {
      const res = await journalModel.getEntries({
        page: entriesPage,
        limit: 20,
        reference_type: referenceTypeFilter || undefined,
      });
      setEntries(res.data);
      setEntriesTotal(res.total);
    } catch {
      toast.error("Gagal memuat jurnal umum");
    } finally {
      setEntriesLoading(false);
    }
  }, [entriesPage, referenceTypeFilter]);

  useEffect(() => {
    if (tab === "jurnal") loadEntries();
  }, [tab, loadEntries]);

  async function viewEntryDetail(id) {
    try {
      const res = await journalModel.getEntryDetail(id);
      setSelectedEntry(res.data);
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function deleteEntry(id) {
    try {
      await journalModel.deleteEntry(id);
      toast.success("Jurnal dihapus");
      loadEntries();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // ─── Input Jurnal Manual ─────────────────────────────────────────────────
  const { user } = useAuth();
  const [manualDate, setManualDate] = useState(today());
  const [manualDescription, setManualDescription] = useState("");
  const [manualLines, setManualLines] = useState([
    { account_code: "", debit: "", credit: "", description: "" },
    { account_code: "", debit: "", credit: "", description: "" },
  ]);
  const [manualSubmitting, setManualSubmitting] = useState(false);

  function addManualLine() {
    setManualLines((prev) => [
      ...prev,
      { account_code: "", debit: "", credit: "", description: "" },
    ]);
  }

  function updateManualLine(index, field, value) {
    setManualLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    );
  }

  function removeManualLine(index) {
    setManualLines((prev) => prev.filter((_, i) => i !== index));
  }

  const manualTotalDebit = manualLines.reduce(
    (s, l) => s + (Number(l.debit) || 0),
    0,
  );
  const manualTotalCredit = manualLines.reduce(
    (s, l) => s + (Number(l.credit) || 0),
    0,
  );
  const manualIsBalanced =
    Math.abs(manualTotalDebit - manualTotalCredit) < 0.01 &&
    manualTotalDebit > 0;

  async function submitManualEntry() {
    if (!manualDate) {
      toast.error("Tanggal jurnal wajib diisi");
      return false;
    }
    if (!manualIsBalanced) {
      toast.error(
        "Jurnal belum balance — total debit harus sama dengan total kredit",
      );
      return false;
    }
    setManualSubmitting(true);
    try {
      await journalModel.createManualEntry({
        entry_date: manualDate,
        description: manualDescription,
        created_by: user?.name || "Admin",
        lines: manualLines
          .filter((l) => Number(l.debit) > 0 || Number(l.credit) > 0)
          .map((l) => ({
            account_code: l.account_code,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            description: l.description,
          })),
      });
      toast.success("Jurnal manual berhasil diposting");
      setManualDescription("");
      setManualLines([
        { account_code: "", debit: "", credit: "", description: "" },
        { account_code: "", debit: "", credit: "", description: "" },
      ]);
      loadEntries();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setManualSubmitting(false);
    }
  }

  // ─── Buku Besar ──────────────────────────────────────────────────────────
  const [ledgerAccountCode, setLedgerAccountCode] = useState("");
  const [ledgerStartDate, setLedgerStartDate] = useState("");
  const [ledgerEndDate, setLedgerEndDate] = useState(today());
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  async function loadLedger() {
    if (!ledgerAccountCode) {
      toast.error("Pilih akun terlebih dahulu");
      return;
    }
    setLedgerLoading(true);
    try {
      const res = await journalModel.getLedger({
        account_code: ledgerAccountCode,
        start_date: ledgerStartDate || undefined,
        end_date: ledgerEndDate || undefined,
      });
      setLedger(res.data);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLedgerLoading(false);
    }
  }

  // ─── Neraca Saldo ────────────────────────────────────────────────────────
  const [trialBalanceDate, setTrialBalanceDate] = useState(today());
  const [trialBalance, setTrialBalance] = useState(null);
  const [trialBalanceLoading, setTrialBalanceLoading] = useState(true);

  const loadTrialBalance = useCallback(async () => {
    setTrialBalanceLoading(true);
    try {
      const res = await journalModel.getTrialBalance({
        as_of_date: trialBalanceDate || undefined,
      });
      setTrialBalance(res.data);
    } catch {
      toast.error("Gagal memuat neraca saldo");
    } finally {
      setTrialBalanceLoading(false);
    }
  }, [trialBalanceDate]);

  useEffect(() => {
    if (tab === "neraca") loadTrialBalance();
  }, [tab, loadTrialBalance]);

  // ─── Laporan Arus Kas ────────────────────────────────────────────────────
  function firstDayOfMonth() {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  }
  const [cashFlowStartDate, setCashFlowStartDate] = useState(firstDayOfMonth());
  const [cashFlowEndDate, setCashFlowEndDate] = useState(today());
  const [cashFlow, setCashFlow] = useState(null);
  const [cashFlowLoading, setCashFlowLoading] = useState(true);

  const loadCashFlow = useCallback(async () => {
    setCashFlowLoading(true);
    try {
      const res = await journalModel.getCashFlow({
        start_date: cashFlowStartDate || undefined,
        end_date: cashFlowEndDate || undefined,
      });
      setCashFlow(res.data);
    } catch {
      toast.error("Gagal memuat laporan arus kas");
    } finally {
      setCashFlowLoading(false);
    }
  }, [cashFlowStartDate, cashFlowEndDate]);

  useEffect(() => {
    if (tab === "arus-kas") loadCashFlow();
  }, [tab, loadCashFlow]);

  // ─── Modal Usaha (Modal Awal, setoran & penarikan modal) ─────────────────
  const [capitalSummary, setCapitalSummary] = useState(null);
  const [capitalSummaryLoading, setCapitalSummaryLoading] = useState(true);
  const [capitalTx, setCapitalTx] = useState([]);
  const [capitalTxTotal, setCapitalTxTotal] = useState(0);
  const [capitalTxPage, setCapitalTxPage] = useState(1);
  const [capitalTxLoading, setCapitalTxLoading] = useState(true);

  const [capitalForm, setCapitalForm] = useState({
    transaction_date: today(),
    type: "setoran",
    target_account: "kas",
    amount: "",
    description: "",
  });
  const [capitalSubmitting, setCapitalSubmitting] = useState(false);

  const loadCapitalSummary = useCallback(async () => {
    setCapitalSummaryLoading(true);
    try {
      const res = await capitalModel.getSummary();
      setCapitalSummary(res.data);
    } catch {
      toast.error("Gagal memuat ringkasan Modal Usaha");
    } finally {
      setCapitalSummaryLoading(false);
    }
  }, []);

  const loadCapitalTx = useCallback(async () => {
    setCapitalTxLoading(true);
    try {
      const res = await capitalModel.getTransactions({
        page: capitalTxPage,
        limit: 20,
      });
      setCapitalTx(res.data);
      setCapitalTxTotal(res.total);
    } catch {
      toast.error("Gagal memuat riwayat Modal Usaha");
    } finally {
      setCapitalTxLoading(false);
    }
  }, [capitalTxPage]);

  useEffect(() => {
    if (tab === "modal") {
      loadCapitalSummary();
      loadCapitalTx();
    }
  }, [tab, loadCapitalSummary, loadCapitalTx]);

  function updateCapitalForm(field, value) {
    setCapitalForm((f) => ({ ...f, [field]: value }));
  }

  // is_initial otomatis true hanya jika belum pernah ada Modal Awal —
  // supaya tombol "Simpan sebagai Modal Awal" hanya relevan sekali saja.
  async function submitCapital(isInitial) {
    if (!capitalForm.transaction_date) {
      toast.error("Tanggal wajib diisi");
      return false;
    }
    if (!capitalForm.amount || Number(capitalForm.amount) <= 0) {
      toast.error("Jumlah harus lebih dari 0");
      return false;
    }
    setCapitalSubmitting(true);
    try {
      await capitalModel.createTransaction({
        transaction_date: capitalForm.transaction_date,
        type: isInitial ? "setoran" : capitalForm.type,
        target_account: capitalForm.target_account,
        amount: Number(capitalForm.amount),
        description: capitalForm.description,
        is_initial: !!isInitial,
      });
      toast.success(
        isInitial
          ? "Modal awal berhasil dicatat"
          : "Transaksi modal berhasil dicatat",
      );
      setCapitalForm({
        transaction_date: today(),
        type: "setoran",
        target_account: "kas",
        amount: "",
        description: "",
      });
      loadCapitalSummary();
      loadCapitalTx();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setCapitalSubmitting(false);
    }
  }

  return {
    tab,
    setTab,

    accounts,
    accountsLoading,
    createAccount,
    reloadAccounts: loadAccounts,

    entries,
    entriesTotal,
    entriesPage,
    setEntriesPage,
    entriesLoading,
    referenceTypeFilter,
    setReferenceTypeFilter,
    selectedEntry,
    setSelectedEntry,
    viewEntryDetail,
    deleteEntry,

    manualDate,
    setManualDate,
    manualDescription,
    setManualDescription,
    manualLines,
    addManualLine,
    updateManualLine,
    removeManualLine,
    manualTotalDebit,
    manualTotalCredit,
    manualIsBalanced,
    manualSubmitting,
    submitManualEntry,

    ledgerAccountCode,
    setLedgerAccountCode,
    ledgerStartDate,
    setLedgerStartDate,
    ledgerEndDate,
    setLedgerEndDate,
    ledger,
    ledgerLoading,
    loadLedger,

    trialBalanceDate,
    setTrialBalanceDate,
    trialBalance,
    trialBalanceLoading,

    cashFlowStartDate,
    setCashFlowStartDate,
    cashFlowEndDate,
    setCashFlowEndDate,
    cashFlow,
    cashFlowLoading,

    capitalSummary,
    capitalSummaryLoading,
    capitalTx,
    capitalTxTotal,
    capitalTxPage,
    setCapitalTxPage,
    capitalTxLoading,
    capitalForm,
    updateCapitalForm,
    capitalSubmitting,
    submitCapital,
  };
}
