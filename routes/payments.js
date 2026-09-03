const router = require("express").Router();
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const Order = require("../models/Order");
const { auth, adminOnly } = require("../middleware/auth");
const upload = require("../middleware/upload");

// Resolve a human bookingId (e.g. BK-202609-5171) or Mongo _id to a Booking._id
async function resolveBookingId(ref) {
  if (!ref) return undefined;
  try {
    const b = await Booking.findById(ref);
    if (b) return b._id;
  } catch { /* not a valid ObjectId — fall through to string lookup */ }
  const b = await Booking.findOne({ bookingId: ref });
  return b ? b._id : undefined;
}

// Resolve a human orderId (e.g. ORD-...) or Mongo _id to an Order._id
async function resolveOrderId(ref) {
  if (!ref) return undefined;
  try {
    const o = await Order.findById(ref);
    if (o) return o._id;
  } catch { /* not a valid ObjectId — fall through to string lookup */ }
  const o = await Order.findOne({ orderId: ref });
  return o ? o._id : undefined;
}

// POST /api/payments/upload - Upload payment screenshot
router.post("/upload", auth, upload.single("screenshot"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ message: "Screenshot uploaded", url });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

function genPaymentId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(Math.random() * 90000 + 10000);
  return `PAY-${y}${m}-${rand}`;
}

// POST /api/payments - Submit payment (UPI screenshot + UTR)
router.post("/", auth, async (req, res) => {
  try {
    const { amount, method, transactionId, upiId, referenceType, bookingId, orderId, referenceName, screenshotUrl } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Valid amount required" });
    }

    // bookingId/orderId from clients are human strings (BK-..., ORD-...) — resolve to ObjectId
    const resolvedBookingId = await resolveBookingId(bookingId);
    const resolvedOrderId = await resolveOrderId(orderId);
    if (bookingId && !resolvedBookingId) {
      return res.status(400).json({ message: "Booking not found" });
    }
    if (orderId && !resolvedOrderId) {
      return res.status(400).json({ message: "Order not found" });
    }

    const payment = await Payment.create({
      paymentId: genPaymentId(),
      customerId: req.user._id,
      amount,
      method: method || "UPI",
      transactionId: transactionId || "",
      upiId: upiId || "",
      screenshotUrl: screenshotUrl || "",
      referenceType: referenceType || "BOOKING",
      bookingId: resolvedBookingId,
      orderId: resolvedOrderId,
      referenceName: referenceName || "",
      status: "PENDING",
    });

    res.status(201).json({ message: "Payment submitted for verification", payment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/payments - My payments (customer) or all (admin)
router.get("/", auth, async (req, res) => {
  try {
    const filter = req.user.role === "ADMIN" ? {} : { customerId: req.user._id };
    const payments = await Payment.find(filter)
      .populate("customerId", "fullName mobile userId")
      .populate("bookingId", "bookingId")
      .populate("orderId", "orderId")
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/payments/:id/approve - Admin
router.patch("/:id/approve", auth, adminOnly, async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      { status: "APPROVED", approvedAt: new Date() },
      { new: true }
    );
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    res.json({ message: "Payment approved", payment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/payments/:id/reject - Admin
router.patch("/:id/reject", auth, adminOnly, async (req, res) => {
  try {
    const { reason } = req.body;
    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      { status: "REJECTED", rejectionReason: reason || "" },
      { new: true }
    );
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    res.json({ message: "Payment rejected", payment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
