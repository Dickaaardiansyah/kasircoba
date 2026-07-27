// src/models/capitalModel.js — MODEL layer: Modal Usaha (Modal Awal, setoran & penarikan modal)
import { httpClient } from "./httpClient";

export const capitalModel = {
  getSummary: (params) => httpClient.get("/capital/summary", params),
  getTransactions: (params) => httpClient.get("/capital/transactions", params),
  createTransaction: (payload) =>
    httpClient.post("/capital/transactions", payload),
};
