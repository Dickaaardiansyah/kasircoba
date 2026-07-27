// src/presenters/useStockOpnamePresenter.js
// ─────────────────────────────────────────────────────────────────────────────
// PRESENTER LAYER — menghubungkan View (StockOpname.jsx) dengan Model
// (stockOpnameModel). Menangani: daftar riwayat sesi, form sesi baru
// (pilih produk → input stok fisik → hitung selisih → simpan).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { stockOpnameModel } from "../models/stockOpnameModel";
import { useAuth } from "../context/AuthContext";

function today() {
  return new Date().toISOString().split("T")[0];
}

export function useStockOpnamePresenter() {
  const [tab, setTab] = useState("list"); // list | new
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await stockOpnameModel.list({ page, limit: 20 });
      setSessions(res.data);
      setTotal(res.total);
    } catch {
      toast.error("Gagal memuat riwayat stock opname");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  async function viewDetail(id) {
    try {
      const res = await stockOpnameModel.getById(id);
      setSelected(res.data);
    } catch {
      toast.error("Gagal memuat detail stock opname");
    }
  }

  return {
    tab,
    setTab,
    sessions,
    total,
    page,
    setPage,
    loading,
    selected,
    setSelected,
    viewDetail,
    reload: load,
  };
}

/** Presenter form sesi stock opname baru. */
export function useStockOpnameFormPresenter(onSuccess) {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [items, setItems] = useState([]); // { product_id, product_name, barcode, unit, system_stock, cost_price, physical_stock, notes }
  const [opnameDate, setOpnameDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const res = await stockOpnameModel.listProducts();
      setProducts(res.data);
    } catch {
      toast.error("Gagal memuat daftar produk");
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  function addItem(product) {
    setItems((prev) => {
      if (prev.some((i) => i.product_id === product.id)) return prev;
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          barcode: product.barcode,
          unit: product.unit || "pcs",
          system_stock: product.stock,
          cost_price: product.cost_price || 0,
          physical_stock: product.stock,
          notes: "",
        },
      ];
    });
  }

  function addAllVisible(visibleProducts) {
    setItems((prev) => {
      const existingIds = new Set(prev.map((i) => i.product_id));
      const additions = visibleProducts
        .filter((p) => !existingIds.has(p.id))
        .map((p) => ({
          product_id: p.id,
          product_name: p.name,
          barcode: p.barcode,
          unit: p.unit || "pcs",
          system_stock: p.stock,
          cost_price: p.cost_price || 0,
          physical_stock: p.stock,
          notes: "",
        }));
      return [...prev, ...additions];
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

  const itemsWithDiff = items.map((i) => {
    const physical =
      i.physical_stock === "" ? 0 : parseInt(i.physical_stock) || 0;
    const difference = physical - i.system_stock;
    return {
      ...i,
      difference,
      difference_value: difference * parseFloat(i.cost_price || 0),
    };
  });

  const totalDifferenceQty = itemsWithDiff.reduce(
    (s, i) => s + i.difference,
    0,
  );
  const totalDifferenceValue = itemsWithDiff.reduce(
    (s, i) => s + i.difference_value,
    0,
  );
  const totalSelisihItems = itemsWithDiff.filter(
    (i) => i.difference !== 0,
  ).length;

  async function submit() {
    if (items.length === 0) {
      toast.error("Pilih minimal satu produk untuk diperiksa");
      return false;
    }
    setSubmitting(true);
    try {
      await stockOpnameModel.create({
        opname_date: opnameDate,
        notes,
        recorded_by: user?.name || "Admin",
        items: itemsWithDiff.map((i) => ({
          product_id: i.product_id,
          physical_stock:
            i.physical_stock === "" ? 0 : parseInt(i.physical_stock),
          notes: i.notes,
        })),
      });
      toast.success("Stock opname tersimpan, stok sistem telah disesuaikan");
      setItems([]);
      setNotes("");
      loadProducts();
      onSuccess?.();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return {
    products,
    loadingProducts,
    items: itemsWithDiff,
    addItem,
    addAllVisible,
    updateItem,
    removeItem,
    opnameDate,
    setOpnameDate,
    notes,
    setNotes,
    submitting,
    submit,
    totalDifferenceQty,
    totalDifferenceValue,
    totalSelisihItems,
  };
}
