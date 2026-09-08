const express = require("express");
const router = express.Router();
const Payout = require("../models/Payout");
const { auth, adminOnly } = require("../middleware/auth");

// ── GET /api/payouts — admin sees all payouts ──
router.get("/", auth, adminOnly, async (req, res) => {
  try {
    const { status, salonId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (salonId) filter.salonId = salonId;

    const payouts = await Payout.find(filter)
      .sort({ closedAt: -1 })
      .limit(200);

    // Summary
    const allPending = await Payout.find({ status: "PENDING" });
    const allPartial = await Payout.find({ status: "PARTIAL" });
    const totalPending = allPending.reduce((s, p) => s + Math.max(0, p.salonShare - p.paidAmount), 0);
    const totalPartial = allPartial.reduce((s, p) => s + Math.max(0, p.salonShare - p.paidAmount), 0);

    res.json({
      data: payouts,
      summary: {
        totalPending: totalPending + totalPartial,
        pendingCount: allPending.length + allPartial.length,
        paidCount: (await Payout.countDocuments({ status: "PAID" })),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/payouts/salon/:salonId — payouts for a specific salon ──
router.get("/salon/:salonId", auth, async (req, res) => {
  try {
    const payouts = await Payout.find({ salonId: req.params.salonId })
      .sort({ closedAt: -1 })
      .limit(100);
    res.json({ data: payouts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── PATCH /api/payouts/:id/pay — admin marks payout as paid ──
router.patch("/:id/pay", auth, adminOnly, async (req, res) => {
  try {
    const { paidAmount, paidVia, transactionRef, adminRemarks } = req.body;

    const payout = await Payout.findById(req.params.id);
    if (!payout) return res.status(404).json({ message: "Payout not found" });
    if (payout.status === "PAID") {
      return res.status(400).json({ message: "Ye payout pehle se paid hai." });
    }

    const amount = Math.max(0, Number(paidAmount) || 0);
    if (amount <= 0) {
      return res.status(400).json({ message: "Paid amount 0 se bada hona chahiye." });
    }

    payout.paidAmount = Math.min(payout.salonShare, payout.paidAmount + amount);
    payout.paidVia = paidVia || payout.paidVia || "BANK";
    payout.transactionRef = transactionRef || payout.transactionRef;
    payout.adminRemarks = adminRemarks || payout.adminRemarks;

    if (payout.paidAmount >= payout.salonShare) {
      payout.status = "PAID";
      payout.paidAt = new Date();
    } else {
      payout.status = "PARTIAL";
    }

    await payout.save();
    res.json({ message: "Payout updated", payout });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── PATCH /api/payouts/:id/share — admin sets salon share amount ──
router.patch("/:id/share", auth, adminOnly, async (req, res) => {
  try {
    const { salonShare, commissionRate, adminRemarks } = req.body;

    const payout = await Payout.findById(req.params.id);
    if (!payout) return res.status(404).json({ message: "Payout not found" });

    if (salonShare !== undefined) {
      payout.salonShare = Math.max(0, Number(salonShare) || 0);
    }
    if (commissionRate !== undefined) {
      payout.commissionRate = Math.max(0, Math.min(100, Number(commissionRate) || 0));
      // Auto-calculate salon share if commission rate provided
      if (salonShare === undefined && payout.finalPrice > 0) {
        payout.salonShare = Math.round(payout.finalPrice * (payout.commissionRate / 100));
      }
    }
    if (adminRemarks !== undefined) {
      payout.adminRemarks = adminRemarks;
    }

    await payout.save();
    res.json({ message: "Payout share updated", payout });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/payouts/summary — aggregated payout stats ──
router.get("/summary", auth, adminOnly, async (req, res) => {
  try {
    const pipeline = [
      { $group: {
        _id: "$salonId",
        salonName: { $first: "$salonName" },
        totalBookings: { $sum: 1 },
        totalCollected: { $sum: "$finalPrice" },
        totalSalonShare: { $sum: "$salonShare" },
        totalPaid: { $sum: "$paidAmount" },
        pendingAmount: {
          $sum: { $subtract: ["$salonShare", "$paidAmount"] }
        },
      }},
      { $sort: { pendingAmount: -1 } },
    ];

    const summary = await Payout.aggregate(pipeline);
    res.json({ data: summary });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
