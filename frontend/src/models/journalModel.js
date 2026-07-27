// src/models/journalModel.js — MODEL layer: Jurnal Akuntansi Otomatis
import { httpClient } from "./httpClient";

export const journalModel = {
  getAccounts: (params) => httpClient.get("/journal/accounts", params),
  createAccount: (payload) => httpClient.post("/journal/accounts", payload),
  updateAccount: (id, payload) =>
    httpClient.put(`/journal/accounts/${id}`, payload),

  getEntries: (params) => httpClient.get("/journal/entries", params),
  getEntryDetail: (id) => httpClient.get(`/journal/entries/${id}`),
  createManualEntry: (payload) => httpClient.post("/journal/entries", payload),
  deleteEntry: (id) => httpClient.delete(`/journal/entries/${id}`),

  getLedger: (params) => httpClient.get("/journal/ledger", params),
  getTrialBalance: (params) => httpClient.get("/journal/trial-balance", params),
  getCashFlow: (params) => httpClient.get("/journal/cash-flow", params),
};
