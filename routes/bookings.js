const router = require("express").Router();
const Booking = require("../models/Booking");
const Wallet = require("../models/Wallet");
const { auth, adminOnly, approvedCustomer } = require("../middleware/auth");

// Generate booking ID
function genBookingId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `BK-${y}${m}-${rand}`;
}

// POST /api/bookings - Create booking
router.post("/", auth, approvedCustomer, async (req, res) => {
  try {
    const {
      serviceName, serviceCategory, serviceLocation, address, city, pincode,
      salonId, salonName, date, timeSlot, amount, paymentMethod,
      bobPaidAmount, cashAmount, emiAmount,
    } = req.body;

    if (!serviceName || !serviceLocation || !date || !amount) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Home service minimum ₹2,500 check
    if (serviceLocation === "HOME" && amount < 2500) {
      return res.status(400).json({
        message: "Home service requires minimum cart of ₹2,500",
        meetsMin: false,
      });
    }

    // BOB FIFO deduction
    let bobPaid = 0;
    if (paymentMethod === "BOB" || paymentMethod === "MIXED") {
      bobPaid = Math.min(bobPaidAmount || 0, amount);
    }

    const booking = await Booking.create({
      bookingId: genBookingId(),
      customerId: req.user._id,
      serviceName,
      serviceCategory: serviceCategory || "",
      serviceLocation,
      address: address || "",
      city: city || "",
      pincode: pincode || "",
      salonId: salonId || undefined,
      salonName: salonName || "",
      date,
      timeSlot: timeSlot || "",
      customerName: req.user.fullName,
      customerPhone: req.user.mobile,
      customerEmail: req.user.email,
      amount,
      paymentMethod: paymentMethod || "FULL",
      bobPaidAmount: bobPaid,
      cashAmount: cashAmount || 0,
      emiAmount: emiAmount || 0,
      // Manual payment model: NO auto-PAID. Customer pays via UPI, admin
      // verifies & approves the Payment record — only then is it PAID.
      paymentStatus: paymentMethod === "BOB" ? "PAID" : "PENDING",
      meetsMinAmount: serviceLocation !== "HOME" || amount >= 2500,
    });

    res.status(201).json({ message: "Booking created", booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/bookings - My bookings (customer) or all (admin)
router.get("/", auth, async (req, res) => {
  try {
    const filter = req.user.role === "ADMIN"
      ? {}
      : { customerId: req.user._id };

    const bookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .populate("customerId", "fullName mobile email")
      .populate("salonId", "name city");

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/bookings/:id
router.get("/:id", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("customerId", "fullName mobile email")
      .populate("salonId", "name city address");
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/bookings/:id/status - Admin update status
router.patch("/:id/status", auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    // Find by _id or bookingId string
    let booking = null;
    try { booking = await Booking.findById(req.params.id); } catch {}
    if (!booking) booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.status = status;
    await booking.save();

    res.json({ message: "Status updated", booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/bookings/:id/pay - Mark paid (after Payment approved manually)
router.patch("/:id/pay", auth, adminOnly, async (req, res) => {
  try {
    let booking = null;
    try { booking = await Booking.findById(req.params.id); } catch {}
    if (!booking) booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.paymentStatus = "PAID";
    await booking.save();
    res.json({ message: "Booking marked PAID", booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/bookings/:id/close - Admin closure with rating
router.patch("/:id/close", auth, adminOnly, async (req, res) => {
  try {
    const { adminRemarks, customerRemarks, rating } = req.body;
    // Find by _id or bookingId string
    let booking = null;
    try { booking = await Booking.findById(req.params.id); } catch {}
    if (!booking) booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.status = "COMPLETED";
    booking.closedAt = new Date();
    booking.adminRemarks = adminRemarks || "";
    booking.customerRemarks = customerRemarks || "";
    booking.rating = Math.min(5, Math.max(0, Number(rating) || 0));
    booking.paymentStatus = "PAID";
    await booking.save();

    // Also create a Rating record for the ratings collection
    if (booking.rating > 0) {
      const Rating = require("../models/Rating");
      await Rating.findOneAndUpdate(
        { bookingId: booking._id },
        {
          customerId: booking.customerId,
          customerName: booking.customerName,
          targetType: "SERVICE",
          targetName: booking.serviceName,
          bookingId: booking._id,
          stars: booking.rating,
          customerRemarks: booking.customerRemarks || "",
          adminRemarks: booking.adminRemarks || "",
          isAdminClosed: true,
        },
        { upsert: true, new: true }
      );
    }

    res.json({ message: "Booking closed with rating", booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
