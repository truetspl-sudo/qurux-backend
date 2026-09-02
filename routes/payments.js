const router = require("express").Router();
const Payment = require("../models/Payment");
const { auth, adminOnly } = require("../middleware/auth");
const upload = require("../middleware/upload");

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

    const payment = await Payment.create({
      paymentId: genPaymentId(),
      customerId: req.user._id,
      amount,
      method: method || "UPI",
      transactionId: transactionId || "",
      upiId: upiId || "",
      screenshotUrl: screenshotUrl || "",
      referenceType: referenceType || "BOOKING",
      bookingId: bookingId || undefined,
      orderId: orderId || undefined,
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
    const payments = await Payment.find(filter).sort({ createdAt: -1 });
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
