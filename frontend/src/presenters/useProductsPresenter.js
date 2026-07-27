// src/presenters/useProductsPresenter.js
import { useState, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { productModel } from "../models/productModel";

export const EMPTY_PRODUCT_FORM = {
  barcode: "",
  name: "",
  description: "",
  category_id: "",
  category_name: "",
  price: "",
  price_wholesale: "",
  min_qty_wholesale: "",
  cost_price: "",
  stock: "",
  min_stock: 5,
  unit: "pcs",
  is_active: 1,
  // Selalu mulai dengan satu baris kosong supaya kotak "Cari/Pilih..." satuan
  // tambahan langsung terlihat tanpa perlu klik tombol tambah dulu.
  additional_units: [
    {
      unit_id: null,
      unit_name: "",
      conversion_qty: "",
      price: "",
      price_wholesale: "",
      min_qty_wholesale: "",
    },
  ],
};

// Format: 889 + 10 digit timestamp (desimal detik) + 3 digit random.
function generateBarcodeCode() {
  const ts = Math.floor(Date.now() / 100)
    .toString()
    .slice(-10);
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `889${ts}${rand}`;
}

export function useProductsPresenter() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterLowStock, setFilterLowStock] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, catRes, unitRes] = await Promise.all([
        productModel.list(),
        productModel.listCategories(),
        productModel.listUnits(),
      ]);
      setProducts(prodRes.data);
      setCategories(catRes.data);
      setUnits(unitRes.data);
    } catch {
      toast.error("Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = products.filter((p) => {
    if (
      search &&
      !p.name.toLowerCase().includes(search.toLowerCase()) &&
      !(p.barcode || "").includes(search)
    )
      return false;
    if (filterCategory && p.category_id != filterCategory) return false;
    if (filterLowStock && p.stock > p.min_stock) return false;
    return true;
  });

  async function deleteProduct(product) {
    if (!confirm(`Hapus produk "${product.name}"?`)) return;
    try {
      await productModel.remove(product.id);
      toast.success("Produk dihapus");
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function updateStock(product, { quantity, type, notes }) {
    if (!quantity || isNaN(quantity)) {
      toast.error("Jumlah tidak valid");
      return false;
    }
    try {
      await productModel.updateStock(product.id, {
        quantity: parseInt(quantity),
        type,
        notes,
      });
      toast.success("Stok diperbarui");
      load();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    }
  }

  // Mengambil data produk lengkap (termasuk additional_units/konversi satuan)
  // sebelum membuka form edit — daftar produk (findAll) sengaja tidak
  // menyertakan konversi satuan supaya query listing tetap ringan.
  async function fetchProductForEdit(product) {
    try {
      const res = await productModel.getById(product.id);
      return res.data;
    } catch (e) {
      toast.error(e.message);
      return product;
    }
  }

  // Dipakai kombobox "cari atau buat satuan/kategori baru" di form Produk:
  // simpan ke server lalu masukkan ke daftar lokal supaya langsung terpilih
  // tanpa perlu memuat ulang seluruh halaman.
  async function addCategory(name) {
    const res = await productModel.createCategory({ name });
    setCategories((list) =>
      list.some((c) => c.id === res.data.id) ? list : [...list, res.data],
    );
    return res.data;
  }

  async function addUnit(name) {
    const res = await productModel.createUnit({ name });
    setUnits((list) =>
      list.some((u) => u.id === res.data.id) ? list : [...list, res.data],
    );
    return res.data;
  }

  // Dipakai modal "Kelola Kategori & Satuan" — hapus lalu muat ulang daftar
  // kategori/satuan (dan produk, karena kategori yang dihapus bisa membuat
  // beberapa produk jadi "Tanpa Kategori").
  async function deleteCategory(category) {
    try {
      const res = await productModel.removeCategory(category.id);
      toast.success(res.message || "Kategori dihapus");
      load();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    }
  }

  async function deleteUnit(unit) {
    try {
      const res = await productModel.removeUnit(unit.id);
      toast.success(res.message || "Satuan dihapus");
      load();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    }
  }

  return {
    products,
    categories,
    units,
    loading,
    filtered,
    search,
    setSearch,
    filterCategory,
    setFilterCategory,
    filterLowStock,
    setFilterLowStock,
    reload: load,
    deleteProduct,
    updateStock,
    fetchProductForEdit,
    addCategory,
    addUnit,
    deleteCategory,
    deleteUnit,
  };
}

/**
 * Presenter form tambah/edit produk — dipisah dari daftar produk karena
 * dipakai di dalam modal tersendiri dan punya siklus hidup sendiri
 * (termasuk pengecekan duplikasi barcode secara real-time).
 */
export function useProductFormPresenter(editProduct, onSuccess, onClose) {
  const [form, setForm] = useState(() =>
    editProduct
      ? {
          ...EMPTY_PRODUCT_FORM,
          ...editProduct,
          price_wholesale: editProduct.price_wholesale ?? "",
          min_qty_wholesale: editProduct.min_qty_wholesale ?? "",
          additional_units: [
            ...(editProduct.additional_units || []).map((u) => ({
              unit_id: u.unit_id,
              unit_name: u.unit_name,
              conversion_qty: u.conversion_qty,
              price: u.price ?? "",
              price_wholesale: u.price_wholesale ?? "",
              min_qty_wholesale: u.min_qty_wholesale ?? "",
            })),
            {
              unit_id: null,
              unit_name: "",
              conversion_qty: "",
              price: "",
              price_wholesale: "",
              min_qty_wholesale: "",
            },
          ],
        }
      : EMPTY_PRODUCT_FORM,
  );
  const [submitting, setSubmitting] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [barcodeStatus, setBarcodeStatus] = useState("idle"); // idle|checking|ok|duplicate|error
  const debounceRef = useRef(null);

  useEffect(() => {
    const barcode = form.barcode;
    if (!barcode || barcode.trim().length < 3) {
      setBarcodeStatus("idle");
      return;
    }

    setBarcodeStatus("checking");
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await productModel.getByBarcode(barcode.trim());
        setBarcodeStatus(
          res.data?.id && res.data.id === (editProduct?.id ?? null)
            ? "ok"
            : "duplicate",
        );
      } catch (e) {
        setBarcodeStatus(
          e.message?.includes("404") || e.message?.includes("tidak ditemukan")
            ? "ok"
            : "error",
        );
      }
    }, 500);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.barcode]);

  const [activeErrorTab, setActiveErrorTab] = useState(null);

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
    if (name === "barcode") setIsGenerated(false);
  }

  // ─── Satuan (dasar + tambahan/konversi) ────────────────────────────────
  // Satu daftar konsisten: baris pertama selalu satuan dasar (form.unit,
  // teks bebas — sesuai kolom products.unit yang sudah ada), baris
  // berikutnya satuan tambahan "1 BOX = 12 PCS" dsb. yang diisi lewat
  // SearchCreateSelect (bisa langsung buat satuan baru dari sini). Nama
  // satuan tidak boleh dobel (baik sesama satuan tambahan maupun dengan
  // satuan dasar) — sebelumnya duplikat ini didiamkan begitu saja oleh
  // backend (baris kedua yang sama diam-diam diabaikan saat disimpan),
  // sehingga data yang diketik user hilang tanpa pemberitahuan.
  function unitNameTaken(name, { exceptIndex } = {}) {
    const target = (name || "").trim().toLowerCase();
    if (!target) return false;
    if (target === (form.unit || "").trim().toLowerCase()) return true;
    return form.additional_units.some(
      (row, i) =>
        i !== exceptIndex &&
        (row.unit_name || "").trim().toLowerCase() === target,
    );
  }

  function ensureTrailingEmptyRow(rows) {
    const last = rows[rows.length - 1];
    if (!last || last.unit_id) {
      return [
        ...rows,
        {
          unit_id: null,
          unit_name: "",
          conversion_qty: "",
          price: "",
          price_wholesale: "",
          min_qty_wholesale: "",
        },
      ];
    }
    return rows;
  }

  function selectBaseUnit(option) {
    if (unitNameTaken(option.name)) {
      toast.error(
        `Satuan "${option.name}" sudah dipakai sebagai satuan tambahan`,
      );
      return;
    }
    setField("unit", option.name);
  }

  function addUnitRow() {
    setForm((f) => ({
      ...f,
      additional_units: [
        ...f.additional_units,
        {
          unit_id: null,
          unit_name: "",
          conversion_qty: "",
          price: "",
          price_wholesale: "",
          min_qty_wholesale: "",
        },
      ],
    }));
  }

  function selectAdditionalUnit(index, option) {
    if (unitNameTaken(option.name, { exceptIndex: index })) {
      toast.error(`Satuan "${option.name}" sudah dipakai pada baris lain`);
      return;
    }
    setForm((f) => ({
      ...f,
      additional_units: ensureTrailingEmptyRow(
        f.additional_units.map((row, i) =>
          i === index
            ? { ...row, unit_id: option.id, unit_name: option.name }
            : row,
        ),
      ),
    }));
  }

  function updateUnitRow(index, patch) {
    setForm((f) => ({
      ...f,
      additional_units: f.additional_units.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  // Menghapus pilihan satuan pada satu baris (klik ✕ di chip) — baris tetap
  // ada, kembali ke mode "cari/pilih" supaya bisa diganti.
  function clearUnitRowSelection(index) {
    updateUnitRow(index, { unit_id: null, unit_name: "" });
  }

  function removeUnitRow(index) {
    setForm((f) => ({
      ...f,
      additional_units: f.additional_units.filter((_, i) => i !== index),
    }));
  }

  async function generateBarcode() {
    let code = generateBarcodeCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await productModel.getByBarcode(code);
        code = generateBarcodeCode();
      } catch {
        break; // 404 → barcode bebas dipakai
      }
    }
    setForm((f) => ({ ...f, barcode: code }));
    setIsGenerated(true);
    toast.success("Barcode otomatis berhasil di-generate", { duration: 2000 });
  }

  async function submit() {
    setActiveErrorTab(null);
    if (!form.barcode || !form.name) {
      toast.error("Barcode dan nama produk wajib diisi");
      setActiveErrorTab("umum");
      return;
    }
    if (!form.unit) {
      toast.error("Satuan dasar wajib diisi");
      setActiveErrorTab("umum");
      return;
    }
    if (barcodeStatus === "duplicate") {
      toast.error(
        "Barcode sudah digunakan produk lain, silakan ganti atau generate ulang",
      );
      setActiveErrorTab("umum");
      return;
    }
    if (barcodeStatus === "checking") {
      toast.error("Tunggu sebentar, sedang memeriksa barcode...");
      setActiveErrorTab("umum");
      return;
    }
    if (!form.price) {
      toast.error("Harga eceran wajib diisi");
      setActiveErrorTab("harga");
      return;
    }

    const invalidRow = form.additional_units.find(
      (row) =>
        row.unit_name &&
        (!row.unit_id ||
          !row.conversion_qty ||
          Number(row.conversion_qty) <= 0),
    );
    if (invalidRow) {
      toast.error(
        `Isi nilai konversi satuan "${invalidRow.unit_name || "-"}" dengan benar`,
      );
      setActiveErrorTab("harga");
      return;
    }

    // Setiap satuan tambahan (BOX, LUSIN, dll.) wajib punya harga jualnya
    // sendiri — sama seperti "Def. Hrg Jual Satuan #1/#2" di referensi —
    // supaya kasir bisa menjual satuan itu tanpa harga jatuh ke 0/kosong.
    const missingPriceRow = form.additional_units.find(
      (row) => row.unit_id && (!row.price || Number(row.price) <= 0),
    );
    if (missingPriceRow) {
      toast.error(
        `Isi harga jual satuan "${missingPriceRow.unit_name}" terlebih dahulu`,
      );
      setActiveErrorTab("harga");
      return;
    }

    // Jaring pengaman terakhir: pastikan tidak ada satuan dobel yang lolos
    // dari pengecekan real-time di selectBaseUnit/selectAdditionalUnit.
    const names = [
      form.unit.trim().toLowerCase(),
      ...form.additional_units
        .filter((r) => r.unit_id)
        .map((r) => (r.unit_name || "").trim().toLowerCase()),
    ];
    const dupe = names.find((n, i) => names.indexOf(n) !== i);
    if (dupe) {
      toast.error(
        `Satuan "${dupe}" dipakai lebih dari satu kali, mohon perbaiki`,
      );
      setActiveErrorTab("harga");
      return;
    }

    // Harga grosir tanpa syarat jumlah beli minimum tidak masuk akal — kalau
    // harga grosir diisi (baik untuk satuan dasar maupun satuan tambahan),
    // jumlah beli minimum wajib ikut diisi (minimal 2).
    if (form.price_wholesale && Number(form.price_wholesale) > 0) {
      if (!form.min_qty_wholesale || Number(form.min_qty_wholesale) < 2) {
        toast.error(
          `Isi jumlah beli minimum grosir untuk satuan dasar "${form.unit}" (minimal 2)`,
        );
        setActiveErrorTab("harga");
        return;
      }
    }

    const invalidWholesaleRow = form.additional_units.find(
      (row) =>
        row.unit_id &&
        row.price_wholesale &&
        Number(row.price_wholesale) > 0 &&
        (!row.min_qty_wholesale || Number(row.min_qty_wholesale) < 2),
    );
    if (invalidWholesaleRow) {
      toast.error(
        `Isi jumlah beli minimum grosir untuk satuan "${invalidWholesaleRow.unit_name}" (minimal 2)`,
      );
      setActiveErrorTab("harga");
      return;
    }

    const payload = {
      ...form,
      price_wholesale:
        form.price_wholesale === "" ? null : form.price_wholesale,
      min_qty_wholesale:
        form.min_qty_wholesale === "" ? null : form.min_qty_wholesale,
      additional_units: form.additional_units
        .filter((row) => row.unit_id && row.conversion_qty)
        .map((row) => ({
          unit_id: row.unit_id,
          conversion_qty: row.conversion_qty,
          price: row.price,
          price_wholesale:
            row.price_wholesale === "" ? null : row.price_wholesale,
          min_qty_wholesale:
            row.min_qty_wholesale === "" ? null : row.min_qty_wholesale,
        })),
    };

    setSubmitting(true);
    try {
      if (editProduct) {
        await productModel.update(editProduct.id, payload);
        toast.success("Produk berhasil diperbarui");
      } else {
        await productModel.create(payload);
        toast.success("Produk berhasil ditambahkan");
      }
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(
        e.message?.toLowerCase().includes("barcode")
          ? "Barcode sudah digunakan — coba generate ulang"
          : e.message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return {
    form,
    setField,
    submitting,
    isGenerated,
    barcodeStatus,
    generateBarcode,
    submit,
    activeErrorTab,
    selectBaseUnit,
    addUnitRow,
    selectAdditionalUnit,
    updateUnitRow,
    clearUnitRowSelection,
    removeUnitRow,
    unitNameTaken,
  };
}
