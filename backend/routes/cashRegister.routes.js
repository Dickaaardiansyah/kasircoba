// routes/cashRegister.routes.js
// Modul Kas Kecil (Cash Register): buka/tutup kas & pencatatan cash in/out.
const express = require("express");
const router = express.Router();
const cashRegisterController = require("../controllers/cashRegisterController");
const { authorize } = require("../middleware/auth");

// Buka/tutup kas & catat pemasukan/pengeluaran (fitur "Biaya" di menu kasir)
// tetap terbuka untuk kasir maupun admin.
router.get(
  "/cash-register/cash-out-categories",
  cashRegisterController.getCashOutCategories,
);
router.get(
  "/cash-register/cash-in-categories",
  cashRegisterController.getCashInCategories,
);

router.get("/cash-register/active", cashRegisterController.getActiveShift);
router.post("/cash-register/open", cashRegisterController.openShift);
router.post("/cash-register/:id/close", cashRegisterController.closeShift);

router.post("/cash-register/movements", cashRegisterController.createMovement);
router.delete(
  "/cash-register/movements/:id",
  cashRegisterController.deleteMovement,
);

// Riwayat semua sesi kas (lintas kasir) & detail sesi tertentu — khusus admin.
router.get(
  "/cash-register/history",
  authorize("admin"),
  cashRegisterController.getHistory,
);
router.get(
  "/cash-register/:id",
  authorize("admin"),
  cashRegisterController.getShiftDetail,
);

module.exports = router;
