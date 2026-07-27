// src/models/productModel.js — MODEL layer: produk & kategori
import { httpClient } from "./httpClient";

export const productModel = {
  list: (params) => httpClient.get("/products", params),
  getByBarcode: (barcode) => httpClient.get(`/products/barcode/${barcode}`),
  getById: (id) => httpClient.get(`/products/${id}`),
  create: (payload) => httpClient.post("/products", payload),
  update: (id, payload) => httpClient.put(`/products/${id}`, payload),
  remove: (id) => httpClient.delete(`/products/${id}`),
  updateStock: (id, payload) =>
    httpClient.put(`/products/${id}/stock`, payload),
  getStockHistory: (id) => httpClient.get(`/products/${id}/stock-history`),

  listCategories: () => httpClient.get("/categories"),
  createCategory: (payload) => httpClient.post("/categories", payload),
  removeCategory: (id) => httpClient.delete(`/categories/${id}`),

  listUnits: () => httpClient.get("/units"),
  createUnit: (payload) => httpClient.post("/units", payload),
  removeUnit: (id) => httpClient.delete(`/units/${id}`),
};
