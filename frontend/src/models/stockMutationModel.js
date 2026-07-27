// src/models/stockMutationModel.js — MODEL layer: Mutasi Stok
import { httpClient } from "./httpClient";

export const stockMutationModel = {
  listJenis: () => httpClient.get("/stock-mutations/jenis"),
  list: (params) => httpClient.get("/stock-mutations", params),
  getSummary: (params) => httpClient.get("/stock-mutations/summary", params),
};
