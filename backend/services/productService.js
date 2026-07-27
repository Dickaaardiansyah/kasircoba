// services/productService.js
// ─────────────────────────────────────────────────────────────────────────────
// SERVICE LAYER — aturan bisnis produk & kategori: validasi, kombinasi query,
// dan penerapan hukum-hukum sederhana (mis. barcode harus unik, stok tidak
// boleh minus). Controller memanggil service, service memanggil model.
// ─────────────────────────────────────────────────────────────────────────────
const productModel = require("../models/productModel");
const unitModel = require("../models/unitModel");

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.status = 404;
  }
}

// Harga grosir tanpa syarat jumlah beli minimum tidak masuk akal — kalau
// harga grosir diisi, jumlah beli minimum wajib ikut diisi (>= 2). Dipakai
// baik untuk satuan dasar produk (products.price_wholesale) maupun untuk
// tiap satuan tambahan (product_units.price_wholesale, lihat saveAdditionalUnits).
function resolveWholesaleThreshold(rawPriceWholesale, rawMinQty, label) {
  const priceWholesale =
    rawPriceWholesale === "" ||
    rawPriceWholesale === null ||
    rawPriceWholesale === undefined
      ? null
      : Number(rawPriceWholesale);
  if (!priceWholesale || priceWholesale <= 0) {
    return { priceWholesale: null, minQtyWholesale: null };
  }
  const minQtyWholesale =
    rawMinQty === "" || rawMinQty === null || rawMinQty === undefined
      ? null
      : Number(rawMinQty);
  if (!minQtyWholesale || minQtyWholesale < 2) {
    throw new ValidationError(
      `Isi jumlah beli minimum grosir untuk ${label} (minimal 2)`,
    );
  }
  return { priceWholesale, minQtyWholesale };
}

// Menyimpan satuan tambahan + konversi suatu produk (mis. 1 BOX = 12 PCS),
// relatif terhadap satuan dasar produk (kolom `unit`). Dipanggil dari
// createProduct/updateProduct — payload `additional_units` bersifat opsional;
// kalau tidak dikirim sama sekali, daftar satuan tambahan yang sudah ada
// TIDAK disentuh (supaya update parsial, mis. hanya ganti harga, tidak
// menghapus konfigurasi satuan yang sudah diisi sebelumnya).
async function saveAdditionalUnits(productId, additionalUnits) {
  if (!Array.isArray(additionalUnits)) return;

  await unitModel.deleteByProductId(productId);
  const seenUnitIds = new Set();
  for (const row of additionalUnits) {
    const unitId = Number(row.unit_id);
    const conversionQty = Number(row.conversion_qty);
    if (!unitId || !conversionQty || conversionQty <= 0) continue;
    if (seenUnitIds.has(unitId)) continue; // satu produk tidak boleh punya satuan yang sama dua kali
    seenUnitIds.add(unitId);

    // Harga jual untuk satuan ini (mis. harga per BOX) — wajib diisi supaya
    // kasir bisa menjual satuan ini, sama seperti "Def. Hrg Jual Satuan #1/#2"
    // di form Barang & Jasa referensi. Harga grosir per satuan opsional.
    const price = Number(row.price);
    if (!price || price <= 0) continue;
    let priceWholesale =
      row.price_wholesale === "" ||
      row.price_wholesale === null ||
      row.price_wholesale === undefined
        ? null
        : Number(row.price_wholesale);

    // Harga grosir tanpa syarat jumlah beli tidak masuk akal (kapan berlakunya
    // jadi tidak jelas) — kalau harga grosir diisi, jumlah beli minimum WAJIB
    // ikut diisi (minimal 2, karena grosir hanya masuk akal untuk pembelian
    // lebih dari 1). Kalau harga grosirnya 0/kosong, syarat jumlah diabaikan.
    let minQtyWholesale =
      row.min_qty_wholesale === "" ||
      row.min_qty_wholesale === null ||
      row.min_qty_wholesale === undefined
        ? null
        : Number(row.min_qty_wholesale);
    if (priceWholesale && priceWholesale > 0) {
      if (!minQtyWholesale || minQtyWholesale < 2) {
        throw new ValidationError(
          `Isi jumlah beli minimum grosir untuk satuan "${row.unit_name}" (minimal 2)`,
        );
      }
    } else {
      priceWholesale = null;
      minQtyWholesale = null;
    }

    await unitModel.insertProductUnit({
      productId,
      unitId,
      conversionQty,
      price,
      priceWholesale,
      minQtyWholesale,
    });
  }
}

const productService = {
  listProducts({ category, search, low_stock }) {
    return productModel.findAll({
      categoryId: category,
      search,
      lowStockOnly: low_stock === "true",
    });
  },

  async getByBarcode(barcode) {
    const product = await productModel.findByBarcode(barcode);
    if (!product) throw new NotFoundError("Produk tidak ditemukan");
    return product;
  },

  async getById(id) {
    const product = await productModel.findById(id);
    if (!product) throw new NotFoundError("Produk tidak ditemukan");
    product.additional_units = await unitModel.findByProductId(id);
    return product;
  },

  async createProduct(payload) {
    const { barcode, name, price } = payload;
    if (!barcode || !name || !price)
      throw new ValidationError("Barcode, nama, dan harga wajib diisi");

    const duplicate = await productModel.existsByBarcode(barcode);
    if (duplicate) throw new ValidationError("Barcode sudah digunakan");

    const { priceWholesale, minQtyWholesale } = resolveWholesaleThreshold(
      payload.price_wholesale,
      payload.min_qty_wholesale,
      `satuan dasar "${payload.unit || ""}"`,
    );

    const result = await productModel.create({
      barcode,
      name,
      description: payload.description,
      categoryId: payload.category_id,
      price: payload.price,
      priceWholesale,
      minQtyWholesale,
      costPrice: payload.cost_price,
      stock: payload.stock,
      minStock: payload.min_stock,
      unit: payload.unit,
    });

    const initialStock = Number(payload.stock) || 0;
    if (initialStock > 0) {
      await productModel.addStockHistory({
        productId: result.insertId,
        type: "in",
        quantity: initialStock,
        previousStock: 0,
        newStock: initialStock,
        reference: "initial",
        notes: "Stok awal",
      });
    }
    await saveAdditionalUnits(result.insertId, payload.additional_units);
    return productModel.findByIdRaw(result.insertId);
  },

  async updateProduct(id, payload) {
    const existing = await productModel.findByIdRaw(id);
    if (!existing) throw new NotFoundError("Produk tidak ditemukan");

    let priceWholesalePatch, minQtyWholesalePatch;
    if (payload.price_wholesale !== undefined) {
      const resolved = resolveWholesaleThreshold(
        payload.price_wholesale,
        payload.min_qty_wholesale,
        `satuan dasar "${payload.unit || existing.unit || ""}"`,
      );
      priceWholesalePatch = resolved.priceWholesale;
      minQtyWholesalePatch = resolved.minQtyWholesale;
    }

    await productModel.update(id, existing, {
      barcode: payload.barcode,
      name: payload.name,
      description: payload.description,
      categoryId:
        payload.category_id !== undefined ? payload.category_id : undefined,
      price: payload.price,
      priceWholesale: priceWholesalePatch,
      minQtyWholesale: minQtyWholesalePatch,
      costPrice: payload.cost_price,
      minStock: payload.min_stock,
      unit: payload.unit,
      isActive: payload.is_active,
    });
    await saveAdditionalUnits(id, payload.additional_units);
    return productModel.findByIdRaw(id);
  },

  async updateStock(id, { quantity, type, notes, recorded_by }) {
    const product = await productModel.findByIdRaw(id);
    if (!product) throw new NotFoundError("Produk tidak ditemukan");

    let newStock;
    if (type === "adjustment") newStock = quantity;
    else if (type === "in") newStock = product.stock + quantity;
    else if (type === "out") {
      newStock = product.stock - quantity;
      if (newStock < 0) throw new ValidationError("Stok tidak mencukupi");
    } else {
      throw new ValidationError("Jenis perubahan stok tidak valid");
    }

    await productModel.updateStockValue(id, newStock);
    await productModel.addStockHistory({
      productId: id,
      type,
      quantity,
      previousStock: product.stock,
      newStock,
      notes,
      reference: "manual",
      createdBy: recorded_by || "Admin",
    });
    return productModel.findByIdRaw(id);
  },

  async deleteProduct(id) {
    const product = await productModel.findByIdRaw(id);
    if (!product) throw new NotFoundError("Produk tidak ditemukan");
    await productModel.softDelete(id);
  },

  getStockHistory(id) {
    return productModel.findStockHistory(id);
  },

  listCategories() {
    return productModel.findAllCategories();
  },

  async createCategory({ name, description }) {
    if (!name) throw new ValidationError("Nama kategori wajib diisi");
    const result = await productModel.createCategory(name, description);
    return productModel.findCategoryById(result.insertId);
  },

  // Kategori boleh dihapus meski masih dipakai produk — FK category_id
  // sudah ON DELETE SET NULL, jadi produk yang tadinya pakai kategori ini
  // otomatis jadi "Tanpa Kategori", tidak ikut terhapus.
  async deleteCategory(id) {
    const category = await productModel.findCategoryById(id);
    if (!category) throw new NotFoundError("Kategori tidak ditemukan");
    const { total } = await productModel.countProductsByCategory(id);
    await productModel.deleteCategory(id);
    return { affectedProducts: total || 0 };
  },
};

module.exports = { productService, ValidationError, NotFoundError };
