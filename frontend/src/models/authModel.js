// src/models/authModel.js — MODEL layer: autentikasi
import { httpClient } from "./httpClient";

export const authModel = {
  login: (username, password) =>
    httpClient.post("/auth/login", { username, password }),
  me: () => httpClient.get("/auth/me"),
};
