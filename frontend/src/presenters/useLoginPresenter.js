// src/presenters/useLoginPresenter.js
// ─────────────────────────────────────────────────────────────────────────────
// PRESENTER LAYER — menjembatani View (Login.jsx) dengan Model (authModel).
// Menyimpan state form, memanggil model, dan menerjemahkan hasil/].error
// menjadi sesuatu yang bisa langsung dipakai View tanpa View tahu detail API.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import toast from "react-hot-toast";
import { authModel } from "../models/authModel";
import { useAuth } from "../context/AuthContext";

export function useLoginPresenter() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleShowPassword() {
    setShowPassword((v) => !v);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.username || !form.password) {
      toast.error("Username dan password wajib diisi");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authModel.login(form.username, form.password);
      login(res.data.user, res.data.token);
      toast.success(`Selamat datang, ${res.data.user.name}!`);
    } catch (e) {
      toast.error(e.message || "Login gagal");
    } finally {
      setSubmitting(false);
    }
  }

  return { form, setField, showPassword, toggleShowPassword, submitting, submit };
}
