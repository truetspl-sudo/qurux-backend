const router = require("express").Router();
const User = require("../models/User");
const Booking = require("../models/Booking");
const Order = require("../models/Order");
const Wallet = require("../models/Wallet");
const { auth } = require("../middleware/auth");

// GET /api/customers/dashboard - Customer dashboard summary
router.get("/dashboard", auth, async (req, res) => {
  try {
    const userId = req.user._id;

    const [bookings, orders, wallet] = await Promise.all([
      Booking.find({ customerId: userId }).sort({ createdAt: -1 }),
      Order.find({ customerId: userId }).sort({ createdAt: -1 }),
      Wallet.findOne({ customerId: userId }),
    ]);

    res.json({
      user: req.user,
      bookings,
      orders,
      wallet: wallet || { deposits: [], promotionalBalance: 0 },
      stats: {
        totalBookings: bookings.length,
        activeBookings: bookings.filter((b) =>
          ["PENDING", "CONFIRMED"].includes(b.status)
        ).length,
        totalOrders: orders.length,
        bobBalance: wallet
          ? wallet.deposits
              .filter((d) => d.status === "ACTIVE")
              .reduce((sum, d) => sum + d.originalAmount - d.usedAmount, 0) +
            (wallet.promotionalBalance || 0)
          : 0,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
