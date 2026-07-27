// src/presenters/useCustomersPresenter.js
// ─────────────────────────────────────────────────────────────────────────────
// PRESENTER LAYER — menghubungkan View (Customers.jsx) dengan Model
// (customerModel). Menangani daftar pelanggan, pencarian, dan form tambah/edit.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { customerModel } from "../models/customerModel";

export function useCustomersPresenter() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customerModel.getAll({ search });
      setCustomers(res.data);
    } catch (e) {
      toast.error(e.message || "Gagal memuat data pelanggan");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300); // debounce pencarian
    return () => clearTimeout(t);
  }, [load]);

  async function removeCustomer(customer) {
    if (!window.confirm(`Hapus pelanggan "${customer.name}"?`)) return;
    try {
      await customerModel.remove(customer.id);
      toast.success("Pelanggan berhasil dihapus");
      load();
    } catch (e) {
      toast.error(e.message || "Gagal menghapus pelanggan");
    }
  }

  return {
    customers,
    loading,
    search,
    setSearch,
    reload: load,
    removeCustomer,
  };
}

export function useCustomerFormPresenter({ editCustomer, onSuccess, onClose }) {
  const [form, setForm] = useState({
    name: editCustomer?.name || "",
    phone: editCustomer?.phone || "",
    email: editCustomer?.email || "",
    address: editCustomer?.address || "",
    notes: editCustomer?.notes || "",
  });
  const [saving, setSaving] = useState(false);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Nama pelanggan wajib diisi");
      return;
    }
    setSaving(true);
    try {
      if (editCustomer) {
        await customerModel.update(editCustomer.id, form);
        toast.success("Pelanggan berhasil diperbarui");
      } else {
        await customerModel.create(form);
        toast.success("Pelanggan berhasil ditambahkan");
      }
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e.message || "Gagal menyimpan pelanggan");
    } finally {
      setSaving(false);
    }
  }

  return { form, setField, saving, submit };
}
