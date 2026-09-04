const router = require("express").Router();
const EMIPlan = require("../models/EMIPlan");
const Booking = require("../models/Booking");
const Order = require("../models/Order");
const { auth, adminOnly } = require("../middleware/auth");

// Resolve human bookingId/orderId (BK-..., ORD-...) or Mongo _id to document _id
async function resolveBookingId(ref) {
  if (!ref) return undefined;
  try {
    const b = await Booking.findById(ref);
    if (b) return b._id;
  } catch { /* fall through */ }
  const b = await Booking.findOne({ bookingId: ref });
  return b ? b._id : undefined;
}

async function resolveOrderId(ref) {
  if (!ref) return undefined;
  try {
    const o = await Order.findById(ref);
    if (o) return o._id;
  } catch { /* fall through */ }
  const o = await Order.findOne({ orderId: ref });
  return o ? o._id : undefined;
}

// POST /api/emi - Create EMI plan
router.post("/", auth, async (req, res) => {
  try {
    const { purchaseType, purchaseName, totalAmount, bobPaidAmount, paidAmount, bookingId, orderId } = req.body;

    const bobPaid = Math.min(totalAmount, Math.max(0, bobPaidAmount || 0));
    const alreadyPaid = Math.min(Math.max(0, paidAmount || 0), totalAmount - bobPaid);
    const pending = Math.max(0, totalAmount - bobPaid - alreadyPaid);

    // bookingId/orderId from clients are human strings (BK-..., ORD-...) — resolve to ObjectId
    const resolvedBookingId = await resolveBookingId(bookingId);
    const resolvedOrderId = await resolveOrderId(orderId);
    if (bookingId && !resolvedBookingId) {
      return res.status(400).json({ message: "Booking not found" });
    }
    if (orderId && !resolvedOrderId) {
      return res.status(400).json({ message: "Order not found" });
    }

    const plan = await EMIPlan.create({
      customerId: req.user._id,
      purchaseType,
      purchaseName,
      totalAmount,
      bobPaidAmount: bobPaid,
      paidAmount: alreadyPaid,
      pendingAmount: pending,
      bookingId: resolvedBookingId,
      orderId: resolvedOrderId,
      status: pending <= 0 ? "COMPLETED" : "ACTIVE",
    });

    res.status(201).json({ message: "EMI plan created", plan });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/emi - My plans (customer) or all (admin)
router.get("/", auth, async (req, res) => {
  try {
    const filter = req.user.role === "ADMIN" ? {} : { customerId: req.user._id };
    const plans = await EMIPlan.find(filter).sort({ createdAt: -1 });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/emi/:id
router.get("/:id", auth, async (req, res) => {
  try {
    const plan = await EMIPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "EMI plan not found" });
    res.json(plan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/emi/:id/pay - Submit flexible payment (₹10 to pending)
router.post("/:id/pay", auth, async (req, res) => {
  try {
    const { amount, transactionId, screenshotUrl } = req.body;

    if (!amount || amount < 10) {
      return res.status(400).json({ message: "Minimum payment is ₹10" });
    }

    const plan = await EMIPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "EMI plan not found" });
    if (plan.status === "COMPLETED") {
      return res.status(400).json({ message: "EMI plan already completed" });
    }
    if (amount > plan.pendingAmount) {
      return res.status(400).json({ message: `Payment cannot exceed pending: ₹${plan.pendingAmount}` });
    }

    plan.paymentHistory.push({
      amount,
      transactionId: transactionId || "",
      screenshotUrl: screenshotUrl || "",
      status: "PENDING",
      submittedAt: new Date(),
    });
    await plan.save();

    res.json({ message: "Payment submitted for verification", plan });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/emi/:planId/approve/:paymentId - Admin approve
router.patch("/:planId/approve/:paymentId", auth, adminOnly, async (req, res) => {
  try {
    const plan = await EMIPlan.findById(req.params.planId);
    if (!plan) return res.status(404).json({ message: "EMI plan not found" });

    const payment = plan.paymentHistory.id(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    payment.status = "APPROVED";
    payment.approvedAt = new Date();
    plan.paidAmount = Math.min(plan.totalAmount - plan.bobPaidAmount, plan.paidAmount + payment.amount);
    plan.pendingAmount = Math.max(0, plan.totalAmount - plan.bobPaidAmount - plan.paidAmount);
    plan.status = plan.pendingAmount <= 0 ? "COMPLETED" : "ACTIVE";

    await plan.save();

    // EMI plan ka balance wahi "due" hai — linked booking/order ko sync karo:
    // pending > 0 → PARTIAL (balance EMI pe), pending 0 → PAID (due zero).
    try {
      if (plan.bookingId) {
        const Booking = require("../models/Booking");
        await Booking.findByIdAndUpdate(plan.bookingId, {
          emiAmount: plan.pendingAmount,
          paymentStatus: plan.pendingAmount > 0 ? "PARTIAL" : "PAID",
        });
      }
      if (plan.orderId) {
        const Order = require("../models/Order");
        await Order.findByIdAndUpdate(plan.orderId, {
          emiAmount: plan.pendingAmount,
          paymentStatus: plan.pendingAmount > 0 ? "PARTIAL" : "PAID",
        });
      }
    } catch (e) {
      // linked doc sync optional — plan hi source of truth hai
    }

    res.json({ message: "EMI payment approved", plan });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/emi/:planId/reject/:paymentId - Admin reject
router.patch("/:planId/reject/:paymentId", auth, adminOnly, async (req, res) => {
  try {
    const plan = await EMIPlan.findById(req.params.planId);
    if (!plan) return res.status(404).json({ message: "EMI plan not found" });

    const payment = plan.paymentHistory.id(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    payment.status = "REJECTED";
    await plan.save();
    res.json({ message: "EMI payment rejected", plan });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
