// src/presenters/useStockMutationPresenter.js
// ─────────────────────────────────────────────────────────────────────────────
// PRESENTER LAYER — menghubungkan View (StockMutation.jsx) dengan Model
// (stockMutationModel). Menangani filter (tanggal, produk, jenis mutasi) &
// paginasi daftar mutasi stok.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { stockMutationModel } from "../models/stockMutationModel";
import { productModel } from "../models/productModel";

function firstDayOfThisMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}
function today() {
  return new Date().toISOString().split("T")[0];
}

export function useStockMutationPresenter() {
  const [startDate, setStartDate] = useState(firstDayOfThisMonth());
  const [endDate, setEndDate] = useState(today());
  const [productId, setProductId] = useState("");
  const [jenis, setJenis] = useState("");
  const [page, setPage] = useState(1);
  const [mutations, setMutations] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState([]);
  const [jenisOptions, setJenisOptions] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mutationRes, summaryRes, jenisRes, productRes] = await Promise.all(
        [
          stockMutationModel.list({
            start_date: startDate,
            end_date: endDate,
            product_id: productId || undefined,
            jenis: jenis || undefined,
            page,
            limit: 25,
          }),
          stockMutationModel.getSummary({
            start_date: startDate,
            end_date: endDate,
            product_id: productId || undefined,
          }),
          stockMutationModel.listJenis(),
          productModel.list(),
        ],
      );
      setMutations(mutationRes.data);
      setTotal(mutationRes.total);
      setSummary(summaryRes.data.byType);
      setJenisOptions(jenisRes.data);
      setProducts(productRes.data);
    } catch {
      toast.error("Gagal memuat data mutasi stok");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, productId, jenis, page]);

  useEffect(() => {
    load();
  }, [load]);

  function resetFilters() {
    setStartDate(firstDayOfThisMonth());
    setEndDate(today());
    setProductId("");
    setJenis("");
    setPage(1);
  }

  return {
    startDate,
    setStartDate: (v) => {
      setStartDate(v);
      setPage(1);
    },
    endDate,
    setEndDate: (v) => {
      setEndDate(v);
      setPage(1);
    },
    productId,
    setProductId: (v) => {
      setProductId(v);
      setPage(1);
    },
    jenis,
    setJenis: (v) => {
      setJenis(v);
      setPage(1);
    },
    page,
    setPage,
    mutations,
    total,
    summary,
    jenisOptions,
    products,
    loading,
    resetFilters,
    reload: load,
  };
}
