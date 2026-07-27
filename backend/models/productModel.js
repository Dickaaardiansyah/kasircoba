// models/productModel.js
// ─────────────────────────────────────────────────────────────────────────────
// MODEL LAYER — satu-satunya lapisan yang boleh menyentuh SQL untuk domain
// "produk" & "kategori". Tidak ada logika bisnis di sini, murni akses data.
// ─────────────────────────────────────────────────────────────────────────────
const { query, queryOne, insert, execute } = require("../config/database");

const productModel = {
  findAll({ categoryId, search, lowStockOnly } = {}) {
    let sql = `
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = 1
    `;
    const params = [];

    if (categoryId) {
      sql += " AND p.category_id = ?";
      params.push(categoryId);
    }
    if (search) {
      sql += " AND (p.name LIKE ? OR p.barcode LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    if (lowStockOnly) sql += " AND p.stock <= p.min_stock";

    sql += " ORDER BY p.name ASC";
    return query(sql, params);
  },

  findByBarcode(barcode) {
    return queryOne(
      `SELECT p.*, c.name AS category_name
       FROM products p LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.barcode = ? AND p.is_active = 1`,
      [barcode],
    );
  },

  findById(id) {
    return queryOne(
      `SELECT p.*, c.name AS category_name
       FROM products p LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = ?`,
      [id],
    );
  },

  findByIdRaw(id) {
    return queryOne("SELECT * FROM products WHERE id = ?", [id]);
  },

  existsByBarcode(barcode) {
    return queryOne("SELECT id FROM products WHERE barcode = ?", [barcode]);
  },

  create({
    barcode,
    name,
    description,
    categoryId,
    price,
    priceWholesale,
    minQtyWholesale,
    costPrice,
    stock,
    minStock,
    unit,
  }) {
    return insert(
      `INSERT INTO products
        (barcode, name, description, category_id, price, price_wholesale, min_qty_wholesale, cost_price, stock, min_stock, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        barcode,
        name,
        description || "",
        categoryId || null,
        price,
        priceWholesale || null,
        minQtyWholesale || null,
        costPrice || 0,
        stock || 0,
        minStock || 5,
        unit || "pcs",
      ],
    );
  },

  update(id, existing, patch) {
    return execute(
      `UPDATE products
       SET barcode=?, name=?, description=?, category_id=?, price=?, price_wholesale=?, min_qty_wholesale=?, cost_price=?, min_stock=?, unit=?, is_active=?
       WHERE id=?`,
      [
        patch.barcode ?? existing.barcode,
        patch.name ?? existing.name,
        patch.description ?? existing.description,
        patch.categoryId !== undefined
          ? patch.categoryId
          : existing.category_id,
        patch.price ?? existing.price,
        patch.priceWholesale !== undefined
          ? patch.priceWholesale
          : existing.price_wholesale,
        patch.minQtyWholesale !== undefined
          ? patch.minQtyWholesale
          : existing.min_qty_wholesale,
        patch.costPrice ?? existing.cost_price,
        patch.minStock ?? existing.min_stock,
        patch.unit ?? existing.unit,
        patch.isActive !== undefined ? patch.isActive : existing.is_active,
        id,
      ],
    );
  },

  updateStockValue(id, newStock) {
    return execute("UPDATE products SET stock = ? WHERE id = ?", [
      newStock,
      id,
    ]);
  },

  softDelete(id) {
    return execute("UPDATE products SET is_active = 0 WHERE id = ?", [id]);
  },

  // ─── Stock history ──────────────────────────────────────────────────────
  addStockHistory({
    productId,
    type,
    quantity,
    previousStock,
    newStock,
    reference,
    notes,
    createdBy,
  }) {
    return insert(
      `INSERT INTO stock_history
        (product_id, type, quantity, previous_stock, new_stock, reference, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        type,
        quantity,
        previousStock,
        newStock,
        reference || "",
        notes || "",
        createdBy || "",
      ],
    );
  },

  findStockHistory(productId, limit = 50) {
    return query(
      `SELECT sh.*, p.name AS product_name
       FROM stock_history sh JOIN products p ON sh.product_id = p.id
       WHERE sh.product_id = ? ORDER BY sh.created_at DESC LIMIT ?`,
      [productId, limit],
    );
  },

  // ─── Categories ─────────────────────────────────────────────────────────
  // product_count disertakan supaya UI kelola kategori bisa memberi tahu
  // pengguna berapa produk yang akan jadi "Tanpa Kategori" sebelum menghapus.
  findAllCategories() {
    return query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM products p
                WHERE p.category_id = c.id AND p.is_active = 1) AS product_count
       FROM categories c ORDER BY c.name`,
    );
  },

  createCategory(name, description) {
    return insert("INSERT INTO categories (name, description) VALUES (?, ?)", [
      name,
      description || "",
    ]);
  },

  findCategoryById(id) {
    return queryOne("SELECT * FROM categories WHERE id = ?", [id]);
  },

  countProductsByCategory(id) {
    return queryOne(
      "SELECT COUNT(*) AS total FROM products WHERE category_id = ? AND is_active = 1",
      [id],
    );
  },

  deleteCategory(id) {
    return execute("DELETE FROM categories WHERE id = ?", [id]);
  },

  // ─── Digunakan modul akuntansi: nilai persediaan berjalan ──────────────────
  sumInventoryValue() {
    return queryOne(
      `SELECT
         COALESCE(SUM(stock * cost_price), 0) AS inventory_value_at_cost,
         COALESCE(SUM(stock * price), 0)      AS inventory_value_at_retail,
         COALESCE(SUM(stock), 0)              AS total_units
       FROM products WHERE is_active = 1`,
    );
  },
};

module.exports = productModel;
