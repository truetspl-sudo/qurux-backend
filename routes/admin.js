const router = require("express").Router();
const User = require("../models/User");
const Salon = require("../models/Salon");
const Booking = require("../models/Booking");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const EMIPlan = require("../models/EMIPlan");
const Wallet = require("../models/Wallet");
const Rating = require("../models/Rating");
const { auth, adminOnly } = require("../middleware/auth");

// ── GET /api/admin/dashboard - Stats overview ──
router.get("/dashboard", auth, adminOnly, async (req, res) => {
  try {
    const [customers, salons, bookings, orders, payments, emiPlans, wallets, ratings] = await Promise.all([
      User.countDocuments({ role: "CUSTOMER" }),
      Salon.countDocuments(),
      Booking.countDocuments(),
      Order.countDocuments(),
      Payment.countDocuments({ status: "PENDING" }),
      EMIPlan.countDocuments({ status: "ACTIVE" }),
      Wallet.countDocuments(),
      Rating.countDocuments(),
    ]);

    const pendingCustomers = await User.countDocuments({ role: "CUSTOMER", status: "PENDING" });
    const pendingSalons = await Salon.countDocuments({ status: "PENDING" });
    const pendingPayments = await Payment.countDocuments({ status: "PENDING" });

    const totalRevenue = await Booking.aggregate([
      { $match: { status: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.json({
      stats: {
        customers,
        pendingCustomers,
        salons,
        pendingSalons,
        bookings,
        orders,
        pendingPayments,
        activeEMI: emiPlans,
        wallets,
        ratings,
        totalRevenue: totalRevenue[0]?.total || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/admin/customers - All customers ──
router.get("/customers", auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { role: "CUSTOMER" };
    if (status && status !== "ALL") filter.status = status;
    const customers = await User.find(filter).select("-password").sort({ createdAt: -1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Generate unique userId like QUR-XXXXX
function genUserId() {
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `QUR-${rand}`;
}

// ── PATCH /api/admin/customers/:id/approve ──
// Admin manually provides userId (sent to customer via WhatsApp)
router.patch("/customers/:id/approve", auth, adminOnly, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || !userId.trim()) {
      return res.status(400).json({ message: "User ID is required. Admin must provide a User ID to assign." });
    }

    const existingUser = await User.findById(req.params.id);
    if (!existingUser) return res.status(404).json({ message: "User not found" });

    // Check userId is unique
    const taken = await User.findOne({ userId: userId.trim() });
    if (taken && String(taken._id) !== String(existingUser._id)) {
      return res.status(400).json({ message: "This User ID is already taken. Please provide a unique one." });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: "APPROVED", approvedAt: new Date(), userId: userId.trim() },
      { new: true }
    );
    res.json({ message: "Customer approved", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── PATCH /api/admin/customers/:id/reject ──
router.patch("/customers/:id/reject", auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: "REJECTED" },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Customer rejected", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
