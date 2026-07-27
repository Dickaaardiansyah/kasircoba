// src/presenters/useCashierPresenter.js
// ─────────────────────────────────────────────────────────────────────────────
// PRESENTER LAYER — seluruh logika halaman Kasir: keranjang belanja, pencarian
// produk, proses pembayaran, dan pencetakan struk. View (Cashier.jsx) hanya
// merender apa yang presenter ini sediakan.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import { productModel } from "../models/productModel";
import { transactionModel } from "../models/transactionModel";
import { settingsModel } from "../models/settingsModel";
import { customerModel } from "../models/customerModel";
import { printReceiptSmart } from "../utils/printReceipt";
import { usePrinterContext } from "../context/PrinterContext";

export const PAYMENT_METHODS = [
  { id: "cash", label: "Tunai" },
  { id: "debit", label: "Debit/Kredit" },
  { id: "qris", label: "QRIS" },
  { id: "open_bill", label: "Open Bill" },
];

// Jatuh tempo default Open Bill: +30 hari dari hari ini (bisa diubah kasir).
function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

// Menentukan harga & jenis harga (retail/wholesale) yang berlaku secara
// OTOMATIS berdasarkan jumlah beli dibanding min_qty_wholesale produk — tidak
// lagi dipilih manual oleh kasir. Begitu qty di keranjang mencapai/melewati
// batas ini (dan produk itu punya harga grosir), harga grosir langsung
// dipakai; keputusan akhir tetap divalidasi ulang di backend
// (lihat resolveItemPrice di transactionModel.js) supaya tidak bisa dimanipulasi dari klien.
function resolveAutoPricing(product, qty) {
  const wholesale = parseFloat(product.price_wholesale);
  const minQty = parseInt(product.min_qty_wholesale, 10);
  const eligible = wholesale > 0 && minQty > 0 && qty >= minQty;
  return {
    priceType: eligible ? "wholesale" : "retail",
    price: eligible ? wholesale : parseFloat(product.price),
  };
}

export function useCashierPresenter() {
  const [cart, setCart] = useState([]);
  const [barcode, setBarcode] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [allProducts, setAllProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [cashierName, setCashierName] = useState("Kasir");
  const [customerName, setCustomerName] = useState("");
  const [discount, setDiscount] = useState(0);
  // ── Open Bill: pilih pelanggan terdaftar ATAU ketik nama baru, + jatuh tempo
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [storeSettings, setStoreSettings] = useState({});

  const barcodeInputRef = useRef(null);

  const printer = usePrinterContext();

  useEffect(() => {
    productModel
      .list()
      .then((r) => setAllProducts(r.data))
      .catch(() => toast.error("Gagal memuat produk"));
    productModel
      .listCategories()
      .then((r) => setCategories(r.data))
      .catch(() => {});
    settingsModel
      .get()
      .then((r) => setStoreSettings(r.data || {}))
      .catch(() => {});
    customerModel
      .getAll({})
      .then((r) => setCustomers(r.data))
      .catch(() => {});
    barcodeInputRef.current?.focus();
    try {
      const auth = JSON.parse(localStorage.getItem("pos_auth") || "{}");
      if (auth?.user?.name) setCashierName(auth.user.name);
    } catch {}
  }, []);

  const filteredProducts = useMemo(() => {
    let result = allProducts;
    if (selectedCategory)
      result = result.filter((p) => p.category_id == selectedCategory);
    if (searchTerm) {
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.barcode || "").includes(searchTerm),
      );
    }
    return result;
  }, [allProducts, selectedCategory, searchTerm]);

  function addToCart(product) {
    if (product.stock <= 0) {
      toast.error(`Stok ${product.name} habis`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) {
          toast.error(`Stok ${product.name} tidak cukup`);
          return prev;
        }
        const newQty = existing.qty + 1;
        const wasRetail = existing.priceType !== "wholesale";
        const pricing = resolveAutoPricing(existing, newQty);
        if (wasRetail && pricing.priceType === "wholesale") {
          toast.success(
            `Harga grosir ${existing.name} otomatis berlaku (beli ${newQty})`,
            { duration: 2000 },
          );
        }
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: newQty, ...pricing } : i,
        );
      }
      return [
        ...prev,
        {
          ...product,
          qty: 1,
          basePrice: parseFloat(product.price),
          ...resolveAutoPricing(product, 1),
        },
      ];
    });
    toast.success(`${product.name} ditambahkan`, { duration: 1500 });
  }

  async function submitBarcode(e) {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    try {
      const res = await productModel.getByBarcode(code);
      addToCart(res.data);
      barcodeInputRef.current?.classList.add("scanning");
      setTimeout(
        () => barcodeInputRef.current?.classList.remove("scanning"),
        500,
      );
    } catch {
      toast.error(`Produk barcode "${code}" tidak ditemukan`);
    } finally {
      setBarcode("");
    }
  }

  function changeQty(productId, delta) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id !== productId) return item;
          const newQty = item.qty + delta;
          if (newQty <= 0) return null;
          if (newQty > item.stock) {
            toast.error("Stok tidak mencukupi");
            return item;
          }
          const wasWholesale = item.priceType === "wholesale";
          const pricing = resolveAutoPricing(item, newQty);
          if (!wasWholesale && pricing.priceType === "wholesale") {
            toast.success(
              `Harga grosir ${item.name} otomatis berlaku (beli ${newQty})`,
              { duration: 2000 },
            );
          } else if (wasWholesale && pricing.priceType === "retail") {
            toast(
              `Harga grosir ${item.name} tidak berlaku lagi (beli ${newQty})`,
              {
                duration: 2000,
                icon: "ℹ️",
              },
            );
          }
          return { ...item, qty: newQty, ...pricing };
        })
        .filter(Boolean),
    );
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((i) => i.id !== productId));
  }

  function clearCart() {
    if (cart.length > 0 && confirm("Kosongkan keranjang?")) {
      setCart([]);
      setDiscount(0);
    }
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmount = discount || 0;
  const total = subtotal - discountAmount;
  const change = parseFloat(paymentAmount || 0) - total;

  function openPaymentModal() {
    if (cart.length === 0) {
      toast.error("Keranjang kosong");
      return;
    }
    setPaymentAmount(
      paymentMethod === "cash"
        ? Math.ceil(total / 1000) * 1000
        : paymentMethod === "open_bill"
          ? 0
          : total,
    );
    if (paymentMethod === "open_bill") setDueDate(defaultDueDate());
    setShowPayment(true);
  }

  function selectPaymentMethod(id) {
    setPaymentMethod(id);
    if (id === "open_bill") {
      // Open Bill: default DP Rp0 (boleh diisi kasir), jatuh tempo +30 hari
      setPaymentAmount(0);
      setDueDate(defaultDueDate());
    } else {
      setPaymentAmount(id === "cash" ? Math.ceil(total / 1000) * 1000 : total);
    }
  }

  function selectCustomer(customerId) {
    setSelectedCustomerId(customerId);
    const c = customers.find((c) => String(c.id) === String(customerId));
    if (c) setCustomerName(c.name);
  }

  async function processPayment() {
    const paidAmount = parseFloat(paymentAmount) || 0;
    const isOpenBill = paymentMethod === "open_bill";

    if (isOpenBill) {
      if (!customerName.trim()) {
        toast.error("Pelanggan wajib dipilih untuk Open Bill");
        return;
      }
      if (paidAmount > total) {
        toast.error("Jumlah DP tidak boleh melebihi total tagihan");
        return;
      }
      if (!dueDate) {
        toast.error("Tanggal jatuh tempo wajib diisi");
        return;
      }
    } else if (!paidAmount || paidAmount < total) {
      toast.error("Jumlah pembayaran kurang");
      return;
    }

    setLoadingPayment(true);
    try {
      const res = await transactionModel.checkout({
        items: cart.map((i) => ({
          product_id: i.id,
          quantity: i.qty,
          price_type: i.priceType,
        })),
        payment_method: paymentMethod,
        payment_amount: paidAmount,
        customer_name: customerName,
        customer_id: isOpenBill ? selectedCustomerId || null : null,
        due_date: isOpenBill ? dueDate : undefined,
        cashier_name: cashierName,
        discount_amount: discountAmount,
      });

      setLastReceipt(res.data);
      setCart([]);
      setDiscount(0);
      setShowPayment(false);
      setPaymentAmount("");
      setCustomerName("");
      setSelectedCustomerId("");
      setDueDate(defaultDueDate());
      toast.success(
        isOpenBill
          ? "Transaksi Open Bill berhasil dicatat!"
          : "Transaksi berhasil!",
      );
    } catch (e) {
      toast.error(e.message || "Transaksi gagal");
    } finally {
      setLoadingPayment(false);
    }
  }

  async function printReceipt(transaction) {
    await printReceiptSmart(transaction, storeSettings, printer);
  }

  return {
    // data
    cart,
    barcode,
    searchTerm,
    filteredProducts,
    categories,
    selectedCategory,
    subtotal,
    discountAmount,
    total,
    change,
    discount,
    showPayment,
    paymentMethod,
    paymentAmount,
    cashierName,
    customerName,
    customers,
    selectedCustomerId,
    dueDate,
    loadingPayment,
    lastReceipt,
    storeSettings,
    barcodeInputRef,
    printer,
    // setters
    setSearchTerm,
    setSelectedCategory,
    setBarcode,
    setDiscount,
    setCashierName,
    setCustomerName,
    setDueDate,
    setPaymentAmount,
    setShowPayment,
    setLastReceipt,
    // actions
    addToCart,
    submitBarcode,
    changeQty,
    removeFromCart,
    clearCart,
    openPaymentModal,
    selectPaymentMethod,
    selectCustomer,
    processPayment,
    printReceipt,
  };
}
