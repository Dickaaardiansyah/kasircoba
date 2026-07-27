// src/models/cashRegisterModel.js — MODEL layer: Kas Kecil (Cash Register)
import { httpClient } from "./httpClient";

export const cashRegisterModel = {
  getCashOutCategories: () =>
    httpClient.get("/cash-register/cash-out-categories"),
  getCashInCategories: () =>
    httpClient.get("/cash-register/cash-in-categories"),

  getActive: () => httpClient.get("/cash-register/active"),
  open: (payload) => httpClient.post("/cash-register/open", payload),
  close: (id, payload) =>
    httpClient.post(`/cash-register/${id}/close`, payload),

  createMovement: (payload) =>
    httpClient.post("/cash-register/movements", payload),
  deleteMovement: (id) => httpClient.delete(`/cash-register/movements/${id}`),

  history: (params) => httpClient.get("/cash-register/history", params),
  getById: (id) => httpClient.get(`/cash-register/${id}`),
};
