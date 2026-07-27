// src/App.jsx
import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ShiftProvider } from "./context/ShiftContext";
import { PrinterProvider } from "./context/PrinterContext";
import Sidebar from "./views/components/Sidebar";
import Login from "./views/pages/Login";
import Dashboard from "./views/pages/Dashboard";
import Cashier from "./views/pages/Cashier";
import Products from "./views/pages/Products";
import Transactions from "./views/pages/Transactions";
import Reports from "./views/pages/Reports";
import Purchase from "./views/pages/Purchase";
import Settings from "./views/pages/Settings";
import LabaRugi from "./views/pages/LabaRugi";
import StockOpname from "./views/pages/StockOpname";
import StockMutation from "./views/pages/StockMutation";
import CashRegister from "./views/pages/CashRegister";
import Journal from "./views/pages/Journal";
import Customers from "./views/pages/Customers";
import Piutang from "./views/pages/Piutang";
import Utang from "./views/pages/Utang";
import { PageLoader } from "./views/components/UI";

// Halaman "beranda" masing-masing role setelah login / saat akses ditolak.
function homeRouteFor(user) {
  return user?.role === "admin" ? "/dashboard" : "/kasir";
}

function PrivateLayout({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return <PageLoader text="Memuat sesi..." />;
  if (!user) return <Navigate to="/login" replace />;

  if (adminOnly && user.role !== "admin") {
    toast.error("Anda tidak memiliki akses ke halaman ini");
    return <Navigate to={homeRouteFor(user)} replace />;
  }

  return (
    <div className="app-layout">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />

      {/* Backdrop gelap — hanya efektif di mobile karena sidebarOpen cuma bisa
          jadi true lewat tombol hamburger (yang juga cuma tampil di mobile) */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <main className="main-content">
        <div className="mobile-topbar">
          <button
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Buka menu"
          >
            <Menu size={20} />
          </button>
          <span className="mobile-topbar__title">
            POS<span>System</span>
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homeRouteFor(user)} replace /> : <Login />} />

      {/* Halaman khusus admin: dashboard, manajemen produk, laporan, pembelian,
          stok, akuntansi. Kasir yang mencoba mengakses akan dialihkan. */}
      <Route path="/dashboard" element={<PrivateLayout adminOnly><Dashboard /></PrivateLayout>} />
      <Route path="/produk" element={<PrivateLayout adminOnly><Products /></PrivateLayout>} />
      <Route path="/laporan" element={<PrivateLayout adminOnly><Reports /></PrivateLayout>} />
      <Route path="/pembelian" element={<PrivateLayout adminOnly><Purchase /></PrivateLayout>} />
      <Route path="/stock-opname" element={<PrivateLayout adminOnly><StockOpname /></PrivateLayout>} />
      <Route path="/mutasi-stok" element={<PrivateLayout adminOnly><StockMutation /></PrivateLayout>} />
      <Route path="/jurnal" element={<PrivateLayout adminOnly><Journal /></PrivateLayout>} />
      <Route path="/laba-rugi" element={<PrivateLayout adminOnly><LabaRugi /></PrivateLayout>} />
      <Route path="/piutang" element={<PrivateLayout><Piutang /></PrivateLayout>} />
      <Route path="/utang" element={<PrivateLayout adminOnly><Utang /></PrivateLayout>} />

      {/* Halaman yang boleh diakses kasir maupun admin. */}
      <Route path="/kasir" element={<PrivateLayout><Cashier /></PrivateLayout>} />
      <Route path="/transaksi" element={<PrivateLayout><Transactions /></PrivateLayout>} />
      <Route path="/kas-kecil" element={<PrivateLayout><CashRegister /></PrivateLayout>} />
      <Route path="/pelanggan" element={<PrivateLayout><Customers /></PrivateLayout>} />
      <Route path="/pengaturan" element={<PrivateLayout><Settings /></PrivateLayout>} />

      <Route path="*" element={<Navigate to={homeRouteFor(user)} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ShiftProvider>
          <PrinterProvider>
            <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
            <AppRoutes />
          </PrinterProvider>
        </ShiftProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}