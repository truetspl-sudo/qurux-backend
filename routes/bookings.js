const router = require("express").Router();
const Booking = require("../models/Booking");
const Salon = require("../models/Salon");
const Wallet = require("../models/Wallet");
const { auth, adminOnly, approvedCustomer } = require("../middleware/auth");
const { syncEMIPlanFromPayment } = require("../utils/emiSync");

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
      // Manual model (no payment gateway): booking ke waqt koi payment nahi.
      // FULL / EMI / BOB sab PENDING start hote hain — admin service close
      // karte waqt payment update karta hai (mode + amount manually).
      paymentStatus: "PENDING",
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
    let filter;
    if (req.user.role === "ADMIN") {
      filter = {};
    } else if (req.user.role === "SALON_OWNER") {
      // Partner salon: sirf us salon ki bookings dikhengi — doosre salon ki nahi
      const salon = await Salon.findOne({ userId: req.user._id });
      filter = salon ? { salonId: salon._id } : { salonId: null };
    } else {
      filter = { customerId: req.user._id };
    }

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

// PATCH /api/bookings/:id/partner-complete - Partner salon marks service DONE
// (booking status PARTNER_COMPLETED → admin closure page pe "awaiting verification" dikhti hai)
router.patch("/:id/partner-complete", auth, async (req, res) => {
  try {
    let booking = null;
    try { booking = await Booking.findById(req.params.id); } catch {}
    if (!booking) booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.status === "COMPLETED" || booking.status === "CANCELLED") {
      return res.status(400).json({ message: "Ye booking already close/cancel ho chuki hai." });
    }
    if (booking.status === "PARTNER_COMPLETED") {
      return res.status(400).json({ message: "Service pehle se completed mark hai — admin verification ka intezaar hai." });
    }

    if (req.user.role === "SALON_OWNER") {
      // Partner sirf APNI salon ki booking mark kar sakta hai (isolation rule)
      const salon = await Salon.findOne({ userId: req.user._id });
      if (!salon || !booking.salonId || String(booking.salonId) !== String(salon._id)) {
        return res.status(403).json({ message: "Ye booking aapke salon ki nahi hai." });
      }
    } else if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Sirf partner salon ya admin ye action kar sakta hai." });
    }

    booking.status = "PARTNER_COMPLETED";
    booking.partnerCompletedAt = new Date();
    await booking.save();

    res.json({ message: "Service completed mark kar di — admin verification pending.", booking });
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

// PATCH /api/bookings/:id/close - Admin closure (payment reconciliation only)
// RULE: Admin service closure ke waqt rating/review NAHI deta — sirf payment
// update karke close karta hai. Rating sirf customer deta hai (apne dashboard
// se, service complete hone ke baad) aur wahi rating show hoti hai.
router.patch("/:id/close", auth, adminOnly, async (req, res) => {
  try {
    const { adminRemarks, customerRemarks, paymentStatus, cashAmount, paymentMethod, paidVia } = req.body;
    // Find by _id or bookingId string
    let booking = null;
    try { booking = await Booking.findById(req.params.id); } catch {}
    if (!booking) booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.status = "COMPLETED";
    booking.closedAt = new Date();
    booking.adminRemarks = adminRemarks || "";
    booking.customerRemarks = customerRemarks || "";
    // booking.rating is NOT set by admin closure — customer rates later.

    // RULE: payment update closure ke waqt admin karta hai.
    // Default: service done = payment PAID. Admin cash/UPI amount bhi set kar sakta hai.
    booking.paymentStatus =
      paymentStatus && ["PAID", "PENDING", "PARTIAL", "REFUNDED"].includes(paymentStatus)
        ? paymentStatus
        : "PAID";
    if (paymentMethod && ["FULL", "EMI", "BOB", "MIXED", "UPI", "CASH"].includes(paymentMethod)) {
      booking.paymentMethod = paymentMethod === "UPI" || paymentMethod === "CASH" ? "FULL" : paymentMethod;
    }
    if (paidVia && ["CASH", "UPI", "BOB", "EMI"].includes(paidVia)) {
      booking.paidVia = paidVia;
    }
    if (cashAmount !== undefined && !isNaN(Number(cashAmount))) {
      booking.cashAmount = Number(cashAmount);
    }

    // RULE (25/75 EMI — master note): EMI mode (ya booking EMI se chuni gayi
    // thi) me close karne par customer ko bill ka MINIMUM 25% abhi pay karna
    // hota hai. Baaki 75% tak EMI balance banta hai jo customer weekly / jab
    // jitna paisa ho flexible repayments me bhar sakta hai (/emi/:id/pay →
    // admin approve). Bina 25% ke EMI close ALLOWED NAHI.
    const emiPath =
      booking.paidVia === "EMI" ||
      booking.paymentMethod === "EMI" ||
      booking.paymentMethod === "MIXED";
    const totalBill = Math.max(0, Number(booking.amount) || 0);
    const minDown = Math.ceil(totalBill * 0.25);
    const paidAlready = Math.min(totalBill, Math.max(0, Number(booking.bobPaidAmount) || 0));
    const collectedNow = Math.min(
      Math.max(0, Number(booking.cashAmount) || 0),
      totalBill - paidAlready
    );
    if (emiPath && totalBill > 0) {
      const totalPaid = paidAlready + collectedNow;
      if (totalPaid < minDown) {
        return res.status(400).json({
          message: `EMI option pe minimum 25% (₹${minDown}) payment abhi karna hoga — baaki 75% EMI balance banega jo customer flexible repayments me dega.`,
        });
      }
    }
    await booking.save();

    // EMI plan auto-create (balance = total − paid, max 75%)
    if (emiPath) {
      const { pending } = await syncEMIPlanFromPayment({
        refType: "booking",
        doc: booking,
        purchaseType: "SERVICE",
        purchaseName: booking.serviceName || "Qurux Service",
        collectedAmount: booking.cashAmount,
      });
      booking.emiAmount = pending; // balance abhi EMI pe hai (75% tak)
      booking.paymentStatus = pending > 0 ? "PARTIAL" : "PAID";
      await booking.save();
    }

    // NO Rating record is created here — admin closure rating nahi deta.
    // Customer apne dashboard se rate karta hai (POST /api/ratings) aur wahi
    // rating salon/service page pe show hoti hai.

    res.json({ message: "Booking closed", booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
