// config/database.js — MySQL2 dengan connection pool
const mysql = require("mysql2/promise");

let pool = null;

function createPool() {
  pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "pos_system",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "+07:00",
    charset: "utf8mb4",
  });
  return pool;
}

function getPool() {
  if (!pool) throw new Error("Database pool belum diinisialisasi");
  return pool;
}

// ─── Helper: query biasa ──────────────────────────────────────────────────────
async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

// ─── Helper: ambil satu baris ─────────────────────────────────────────────────
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// ─── Helper: INSERT — kembalikan insertId ─────────────────────────────────────
async function insert(sql, params = []) {
  const [result] = await getPool().execute(sql, params);
  return { insertId: result.insertId, affectedRows: result.affectedRows };
}

// ─── Helper: UPDATE/DELETE ────────────────────────────────────────────────────
async function execute(sql, params = []) {
  const [result] = await getPool().execute(sql, params);
  return { affectedRows: result.affectedRows, changedRows: result.changedRows };
}

// ─── Helper: transaction ──────────────────────────────────────────────────────
async function transaction(fn) {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ─── Test koneksi & init pool ─────────────────────────────────────────────────
async function initializeDatabase() {
  console.log("DB Config:");
  console.log({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
  })
  createPool();
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query("SELECT VERSION() as v");
    console.log(`✅ MySQL connected — version: ${rows[0].v}`);
    conn.release();
  } catch (err) {
    console.error("❌ MySQL connection failed:", err.message);
    console.error(
      "   Pastikan MySQL/XAMPP sudah berjalan dan konfigurasi .env sudah benar",
    );
    process.exit(1);
  }
}

module.exports = {
  query,
  queryOne,
  insert,
  execute,
  transaction,
  initializeDatabase,
  getPool,
};
