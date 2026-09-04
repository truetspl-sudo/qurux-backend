require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

// Connect to MongoDB
connectDB();

const app = express();

// ── Middleware ──────────────────────────────
// CORS — allow the live domain, local dev, and Vercel previews
const CORS_ALLOWED = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
function corsOrigin(origin, cb) {
  if (!origin) return cb(null, true); // same-origin / curl
  if (CORS_ALLOWED.length === 0) return cb(null, true); // open
  if (CORS_ALLOWED.includes(origin)) return cb(null, true);
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
  if (/^https?:\/\/.*\.vercel\.app$/.test(origin)) return cb(null, true);
  return cb(null, false);
}
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Routes ─────────────────────────────────
app.use("/api/auth", require("./routes/auth"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/salons", require("./routes/salons"));
app.use("/api/services", require("./routes/services"));
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/products", require("./routes/products"));
app.use("/api/courses", require("./routes/courses"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/emi", require("./routes/emi"));
app.use("/api/wallet", require("./routes/wallet"));
app.use("/api/ratings", require("./routes/ratings"));
app.use("/api/password-resets", require("./routes/password-resets"));
app.use("/api/whatsapp", require("./routes/whatsapp"));
app.use("/api/admin", require("./routes/admin"));

// ── Health check ───────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── 404 ────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ── Error handler ──────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
});

// ── Start ──────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🎋 QURUX Backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});
