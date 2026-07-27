// src/views/pages/Transactions.jsx
import { Eye, X, Printer, Calendar, CalendarDays, Circle, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useTransactionsPresenter } from "../../presenters/useTransactionsPresenter";
import { PageLoader, EmptyState, Badge } from "../components/UI";
import { formatRupiah, formatDateTime, formatDate } from "../../utils/format";

const PAYMENT_LABEL = { cash: "Tunai", debit: "Debit/Kredit", qris: "QRIS", transfer: "Transfer" };

const QUICK_FILTERS = [
  { value: "today", label: "Hari Ini", icon: Calendar },
  { value: "all", label: "Semua", icon: CalendarDays },
  { value: "custom", label: "Custom", icon: Circle },
];

export default function Transactions() {
  const t = useTransactionsPresenter();

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Riwayat Transaksi</div>
          <div className="page-subtitle">{t.total} transaksi ditemukan</div>
        </div>
        <button
          className={`btn btn-ghost btn-icon btn-sm${t.loading ? " tx-refresh--spinning" : ""}`}
          onClick={t.reload}
          disabled={t.loading}
          title="Muat ulang"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="page-body">
        <div className="filter-bar">
          <div className="quick-filter-group">
            {QUICK_FILTERS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                className={`quick-filter-btn${t.quickFilter === value ? " quick-filter-btn--active" : ""}`}
                onClick={() => t.setQuickFilter(value)}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {t.quickFilter === "custom" && (
            <>
              <input type="date" className="form-input" value={t.startDate} onChange={(e) => t.setStartDate(e.target.value)} />
              <input type="date" className="form-input" value={t.endDate} onChange={(e) => t.setEndDate(e.target.value)} />
            </>
          )}

          <select className="form-select tx-method-select" value={t.paymentMethod} onChange={(e) => t.setPaymentMethod(e.target.value)}>
            <option value="">Semua Metode</option>
            <option value="cash">Tunai</option>
            <option value="debit">Debit/Kredit</option>
            <option value="qris">QRIS</option>
          </select>

          <button className="btn btn-ghost btn-sm" onClick={t.resetFilters}>Reset</button>
        </div>

        {t.loading ? (
          <PageLoader />
        ) : t.groupedByDate.length === 0 ? (
          <EmptyState icon={Eye} title="Belum ada transaksi" description="Transaksi kasir akan muncul di sini" />
        ) : (
          <div className="tx-day-list">
            {t.groupedByDate.map((group) => {
              const collapsed = t.collapsedGroups.has(group.dateKey);
              return (
                <div className="tx-day-group" key={group.dateKey}>
                  <button className="tx-day-header" onClick={() => t.toggleGroup(group.dateKey)}>
                    <div className="tx-day-header__left">
                      <Calendar size={14} />
                      <span className="tx-day-header__date">{formatDate(group.date)}</span>
                      <Badge variant="blue">{group.transactions.length} transaksi</Badge>
                    </div>
                    <div className="tx-day-header__right">
                      <span className="tx-day-header__total">
                        Total: <strong>{formatRupiah(group.total)}</strong>
                      </span>
                      {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </div>
                  </button>

                  {!collapsed && (
                    <>
                      <div className="table-container tx-day-table">
                        <table>
                          <thead>
                            <tr><th>Kode</th><th>Waktu</th><th>Kasir</th><th>Metode</th><th>Total</th><th></th></tr>
                          </thead>
                          <tbody>
                            {group.transactions.map((tx) => (
                              <tr key={tx.id}>
                                <td className="font-mono text-xs">{tx.transaction_code}</td>
                                <td className="text-sm">{formatDateTime(tx.created_at)}</td>
                                <td>{tx.cashier_name}</td>
                                <td><Badge variant="blue">{PAYMENT_LABEL[tx.payment_method] || tx.payment_method}</Badge></td>
                                <td className="font-mono font-bold">{formatRupiah(tx.final_amount)}</td>
                                <td>
                                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => t.viewDetail(tx.id)}><Eye size={14} /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="tx-day-footer">
                        <span>{group.transactions.length} transaksi</span>
                        <span>Total: <strong>{formatRupiah(group.total)}</strong></span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {t.selected && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && t.closeDetail()}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Detail Transaksi</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={t.closeDetail}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="statement-row"><span>Kode</span><span className="font-mono">{t.selected.transaction_code}</span></div>
              <div className="statement-row"><span>Waktu</span><span>{formatDateTime(t.selected.created_at)}</span></div>
              <div className="statement-row"><span>Kasir</span><span>{t.selected.cashier_name}</span></div>
              <div className="divider" />
              {t.selected.items?.map((item) => (
                <div key={item.id} className="statement-row">
                  <span>{item.product_name} x{item.quantity}</span>
                  <span className="statement-value">{formatRupiah(item.subtotal)}</span>
                </div>
              ))}
              <div className="divider" />
              <div className="statement-row"><span>Subtotal</span><span className="statement-value">{formatRupiah(t.selected.total_amount)}</span></div>
              <div className="statement-row"><span>Diskon</span><span className="statement-value">-{formatRupiah(t.selected.discount_amount)}</span></div>
              <div className="statement-row statement-row--total"><span>Total</span><span className="statement-value">{formatRupiah(t.selected.final_amount)}</span></div>
              <div className="statement-row"><span>Dibayar</span><span className="statement-value">{formatRupiah(t.selected.payment_amount)}</span></div>
              <div className="statement-row"><span>Kembalian</span><span className="statement-value">{formatRupiah(t.selected.change_amount)}</span></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={t.closeDetail}>Tutup</button>
              <button className="btn btn-primary" onClick={() => t.printReceipt(t.selected)}>
                <Printer size={14} /> Cetak Struk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}