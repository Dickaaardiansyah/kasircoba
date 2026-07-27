// src/views/components/NoShiftScreen.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Ditampilkan di halaman Kasir & Kas Kecil ketika belum ada sesi kas yang
// dibuka — menggantikan alur lama (isi form modal awal manual di tengah
// halaman) dengan gerbang penuh yang mengharuskan "Mulai Shift" dulu.
// ─────────────────────────────────────────────────────────────────────────────
import { ShoppingCart } from "lucide-react";

export default function NoShiftScreen({ onStart }) {
  return (
    <div className="shift-gate fade-in">
      <div className="shift-gate__illustration">
        <ShoppingCart size={40} />
      </div>
      <div className="shift-gate__title">Belum Mulai Shift</div>
      <div className="shift-gate__subtitle">
        Tekan tombol "Mulai Shift" untuk memulai pekerjaan Anda
      </div>
      <button className="btn-shift" onClick={onStart}>Mulai Shift</button>
    </div>
  );
}