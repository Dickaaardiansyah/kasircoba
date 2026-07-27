// src/presenters/useSettingsPresenter.js
import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { settingsModel } from "../models/settingsModel";
import { useAuth } from "../context/AuthContext";

export function useSettingsPresenter() {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState({});
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settingsRes = await settingsModel.get();
      setSettings(settingsRes.data);
      // Daftar pengguna hanya perlu (dan hanya boleh) diambil admin —
      // kasir tidak berwenang mengelola akun pengguna lain.
      if (isAdmin) {
        const usersRes = await settingsModel.listUsers();
        setUsers(usersRes.data);
      }
    } catch {
      toast.error("Gagal memuat pengaturan");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  function setField(key, value) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await settingsModel.update(settings);
      toast.success("Pengaturan berhasil disimpan");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function createUser(payload) {
    try {
      await settingsModel.createUser(payload);
      toast.success("User berhasil dibuat");
      load();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    }
  }

  async function updateUser(id, payload) {
    try {
      await settingsModel.updateUser(id, payload);
      toast.success("User diperbarui");
      load();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    }
  }

  async function removeUser(user) {
    if (!confirm(`Nonaktifkan user "${user.name}"?`)) return;
    try {
      await settingsModel.removeUser(user.id);
      toast.success("User dinonaktifkan");
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function exportTransactions(range) {
    try {
      await settingsModel.exportTransactionsCSV(range);
      toast.success("Data transaksi diunduh");
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function exportProducts() {
    try {
      await settingsModel.exportProductsCSV();
      toast.success("Data produk diunduh");
    } catch (e) {
      toast.error(e.message);
    }
  }

  return {
    settings,
    users,
    loading,
    saving,
    setField,
    saveSettings,
    createUser,
    updateUser,
    removeUser,
    exportTransactions,
    exportProducts,
    reload: load,
  };
}
