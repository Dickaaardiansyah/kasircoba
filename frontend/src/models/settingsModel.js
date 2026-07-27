// src/models/settingsModel.js — MODEL layer: pengaturan toko, user & ekspor CSV
import { httpClient } from "./httpClient";

export const settingsModel = {
  get: () => httpClient.get("/settings"),
  update: (payload) => httpClient.put("/settings", payload),

  listUsers: () => httpClient.get("/users"),
  createUser: (payload) => httpClient.post("/users", payload),
  updateUser: (id, payload) => httpClient.put(`/users/${id}`, payload),
  removeUser: (id) => httpClient.delete(`/users/${id}`),

  exportTransactionsCSV: (params) => {
    const qs = params
      ? "?" + Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
      : "";
    return httpClient.downloadFile(`/export/transactions${qs}`, `transaksi_${new Date().toISOString().split("T")[0]}.csv`);
  },
  exportProductsCSV: () => httpClient.downloadFile("/export/products", "produk.csv"),
};
