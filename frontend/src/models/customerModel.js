// src/models/customerModel.js — MODEL layer: Pelanggan
import { httpClient } from "./httpClient";

export const customerModel = {
  getAll: (params) => httpClient.get("/customers", params),
  getById: (id) => httpClient.get(`/customers/${id}`),
  create: (payload) => httpClient.post("/customers", payload),
  update: (id, payload) => httpClient.put(`/customers/${id}`, payload),
  remove: (id) => httpClient.delete(`/customers/${id}`),
};
