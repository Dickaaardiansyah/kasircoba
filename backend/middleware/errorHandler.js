// middleware/errorHandler.js
// ─────────────────────────────────────────────────────────────────────────────
// Menerjemahkan error yang dilempar service (ValidationError, NotFoundError,
// UnauthorizedError, atau error MySQL) menjadi respons JSON yang konsisten.
// ─────────────────────────────────────────────────────────────────────────────
function notFoundHandler(req, res) {
  res
    .status(404)
    .json({
      success: false,
      message: `${req.method} ${req.path} tidak ditemukan`,
    });
}

function errorHandler(err, req, res, _next) {
  console.error("Server Error:", err.message);
  if (err.code === "ER_DUP_ENTRY") {
    return res.status(400).json({ success: false, message: "Data duplikat" });
  }
  if (
    err.code === "ER_ROW_IS_REFERENCED_2" ||
    err.code === "ER_ROW_IS_REFERENCED"
  ) {
    return res.status(400).json({
      success: false,
      message: "Data ini masih dipakai data lain, tidak bisa dihapus",
    });
  }
  res
    .status(err.status || 500)
    .json({
      success: false,
      message: err.message || "Terjadi kesalahan pada server",
    });
}

module.exports = { notFoundHandler, errorHandler };
