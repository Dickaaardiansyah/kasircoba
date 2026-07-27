// src/models/transactionModel.js — MODEL layer: transaksi kasir & laporan penjualan
import { httpClient } from "./httpClient";

export const transactionModel = {
  checkout: (payload) => httpClient.post("/transactions", payload),
  list: (params) => httpClient.get("/transactions", params),
  getById: (id) => httpClient.get(`/transactions/${id}`),
  getSalesReport: (params) => httpClient.get("/reports/sales", params),
  getSalesByCustomerReport: (params) =>
    httpClient.get("/reports/sales-by-customer", params),
  getProductProfitReport: (params) =>
    httpClient.get("/reports/product-profit", params),
  getDashboardSummary: () => httpClient.get("/dashboard/summary"),
  getDashboardRevenueHistory: (days) =>
    httpClient.get("/dashboard/revenue-history", { days }),
  getDashboardPeriodSummary: (params) =>
    httpClient.get("/dashboard/period-summary", params),
};
