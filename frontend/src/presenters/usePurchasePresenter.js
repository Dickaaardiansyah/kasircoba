// src/presenters/usePurchasePresenter.js
import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { purchaseModel } from "../models/purchaseModel";
import { productModel } from "../models/productModel";

function today() {
  return new Date().toISOString().split("T")[0];
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split("T")[0];
}

export function usePurchasePresenter() {
  const [tab, setTab] = useState("list"); // list | new | suppliers | report
  const [purchases, setPurchases] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [purchaseRes, supplierRes, productRes] = await Promise.all([
        purchaseModel.list({ page, limit: 20 }),
        purchaseModel.listSuppliers(),
        productModel.list(),
      ]);
      setPurchases(purchaseRes.data);
      setTotal(purchaseRes.total);
      setSuppliers(supplierRes.data);
      setProducts(productRes.data);
    } catch {
      toast.error("Gagal memuat data pembelian");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  async function viewDetail(id) {
    try {
      const res = await purchaseModel.getById(id);
      setSelected(res.data);
    } catch {
      toast.error("Gagal memuat detail pembelian");
    }
  }

  return {
    tab,
    setTab,
    purchases,
    total,
    page,
    setPage,
    suppliers,
    products,
    loading,
    selected,
    setSelected,
    viewDetail,
    reload: load,
  };
}

/**
 * Presenter form pembelian baru: keranjang item + satu supplier untuk seluruh
 * transaksi + nota supplier (opsional, satu file untuk seluruh pembelian).
 */
export function usePurchaseFormPresenter(products, onSuccess) {
  const [items, setItems] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [notaFile, setNotaFileState] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("tunai"); // 'tunai' | 'kredit'
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [submitting, setSubmitting] = useState(false);

  function addItem(product) {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing)
        return prev.map((i) =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          unit: product.unit,
          quantity: 1,
          unit_cost: product.cost_price || 0,
          expiry_date: "",
        },
      ];
    });
  }

  function updateItem(productId, field, value) {
    setItems((prev) =>
      prev.map((i) =>
        i.product_id === productId ? { ...i, [field]: value } : i,
      ),
    );
  }

  function removeItem(productId) {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

  function setNotaFile(file) {
    setNotaFileState(file || null);
  }

  const totalCost = items.reduce(
    (s, i) => s + (parseFloat(i.unit_cost) || 0) * (parseInt(i.quantity) || 0),
    0,
  );
  const totalQty = items.reduce((s, i) => s + (parseInt(i.quantity) || 0), 0);

  async function submit() {
    if (items.length === 0) {
      toast.error("Tambahkan minimal satu produk");
      return false;
    }
    if (paymentMethod === "kredit" && !supplierName?.trim()) {
      toast.error("Supplier wajib dipilih untuk pembelian kredit (hutang)");
      return false;
    }
    if (paymentMethod === "kredit" && !dueDate) {
      toast.error("Tanggal jatuh tempo wajib diisi untuk pembelian kredit");
      return false;
    }
    setSubmitting(true);
    try {
      await purchaseModel.createWithNota({
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity: parseInt(i.quantity),
          unit_cost: parseFloat(i.unit_cost),
          expiry_date: i.expiry_date || null,
        })),
        supplier_id: supplierId || null,
        supplier_name: supplierName,
        purchase_date: purchaseDate,
        notes,
        notaFile,
        payment_method: paymentMethod,
        due_date: paymentMethod === "kredit" ? dueDate : null,
      });
      toast.success(
        paymentMethod === "kredit"
          ? "Pembelian kredit dicatat, stok diperbarui & hutang dibuat"
          : "Pembelian berhasil dicatat, stok diperbarui",
      );
      setItems([]);
      setSupplierId("");
      setSupplierName("");
      setNotes("");
      setNotaFileState(null);
      setPaymentMethod("tunai");
      setDueDate(defaultDueDate());
      onSuccess();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return {
    items,
    addItem,
    updateItem,
    removeItem,
    totalCost,
    totalQty,
    supplierId,
    setSupplierId,
    supplierName,
    setSupplierName,
    purchaseDate,
    setPurchaseDate,
    notes,
    setNotes,
    notaFile,
    setNotaFile,
    paymentMethod,
    setPaymentMethod,
    dueDate,
    setDueDate,
    submitting,
    submit,
  };
}
