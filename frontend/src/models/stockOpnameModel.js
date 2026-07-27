// src/models/stockOpnameModel.js — MODEL layer: Stock Opname
import { httpClient } from "./httpClient";

export const stockOpnameModel = {
  listProducts: (params) => httpClient.get("/stock-opname/products", params),
  create: (payload) => httpClient.post("/stock-opname", payload),
  list: (params) => httpClient.get("/stock-opname", params),
  getById: (id) => httpClient.get(`/stock-opname/${id}`),
};
