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

    const allPending = await Payout.find({ status: "PENDING" });
    const totalPending = allPending.reduce((s, p) => s + Math.max(0, p.vendorNetPayout - p.paidAmount), 0);

    res.json({
      data: payouts,
      summary: {
        totalPending,
        pendingCount: allPending.length,
        settledCount: await Payout.countDocuments({ status: "SETTLED" }),
        paidCount: await Payout.countDocuments({ status: "PAID" }),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/payouts/earnings/:salonId — vendor earnings ledger ──
router.get("/earnings/:salonId", auth, async (req, res) => {
  try {
    const payouts = await Payout.find({ salonId: req.params.salonId })
      .sort({ closedAt: -1 })
      .limit(200);

    // Calculate totals
    const totalEarnings = payouts.reduce((s, p) => s + (p.vendorNetPayout || 0), 0);
    const totalDirectCollected = payouts.reduce((s, p) => s + (p.vendorDirectAmount || 0), 0);
    const totalCompanyPaid = payouts.reduce((s, p) => s + Math.max(0, p.vendorNetPayout - p.paidAmount), 0);
    const totalPaidOut = payouts.reduce((s, p) => s + (p.paidAmount || 0), 0);

    // Monthly breakdown
    const monthly = {};
    payouts.forEach((p) => {
      const month = p.closedAt ? new Date(p.closedAt).toISOString().slice(0, 7) : "unknown";
      if (!monthly[month]) monthly[month] = { earnings: 0, directCollected: 0, settled: 0, pending: 0, count: 0 };
      monthly[month].earnings += p.vendorNetPayout || 0;
      monthly[month].directCollected += p.vendorDirectAmount || 0;
      monthly[month].settled += p.paidAmount || 0;
      monthly[month].pending += Math.max(0, (p.vendorNetPayout || 0) - (p.paidAmount || 0));
      monthly[month].count += 1;
    });

    res.json({
      data: payouts,
      ledger: {
        totalEarnings,
        totalDirectCollected,
        pendingPayoutBalance: totalCompanyPaid,
        totalPaidOut,
        serviceCount: payouts.length,
      },
      monthly: Object.entries(monthly)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, data]) => ({ month, ...data })),
    });
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
        totalFinalPrice: { $sum: "$finalPrice" },
        totalGST: { $sum: "$gstAmount" },
        totalCommission: { $sum: "$platformCommission" },
        totalGross: { $sum: "$vendorGrossPayout" },
        totalNet: { $sum: "$vendorNetPayout" },
        totalDirectCollected: { $sum: "$vendorDirectAmount" },
        totalPaidOut: { $sum: "$paidAmount" },
        pendingAmount: {
          $sum: { $subtract: ["$vendorNetPayout", "$paidAmount"] }
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

// ── PATCH /api/payouts/:id/share — admin sets salon share ──
router.patch("/:id/share", auth, adminOnly, async (req, res) => {
  try {
    const { vendorNetPayout, adminRemarks } = req.body;
    const payout = await Payout.findById(req.params.id);
    if (!payout) return res.status(404).json({ message: "Payout not found" });
    if (vendorNetPayout !== undefined) payout.vendorNetPayout = Math.max(0, Number(vendorNetPayout) || 0);
    if (adminRemarks !== undefined) payout.adminRemarks = adminRemarks;
    await payout.save();
    res.json({ message: "Payout share updated", payout });
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
    if (amount <= 0) return res.status(400).json({ message: "Paid amount 0 se bada hona chahiye." });

    payout.paidAmount = Math.min(payout.vendorNetPayout, payout.paidAmount + amount);
    payout.paidVia = paidVia || payout.paidVia || "BANK";
    payout.transactionRef = transactionRef || payout.transactionRef;
    if (adminRemarks !== undefined) payout.adminRemarks = adminRemarks;

    if (payout.paidAmount >= payout.vendorNetPayout) {
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

// ── POST /api/payouts/settle/:month — monthly settlement (e.g. "2026-09") ──
router.post("/settle/:month", auth, adminOnly, async (req, res) => {
  try {
    const month = req.params.month; // "2026-09"
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "Month format YYYY-MM chahiye." });
    }

    const startDate = new Date(`${month}-01T00:00:00.000Z`);
    const endMonth = month.slice(5, 7) === "12" ? "01" : String(Number(month.slice(5, 7)) + 1).padStart(2, "0");
    const endYear = month.slice(5, 7) === "12" ? Number(month.slice(0, 4)) + 1 : Number(month.slice(0, 4));
    const endDate = new Date(`${endYear}-${endMonth}-01T00:00:00.000Z`);

    // Find all PENDING payouts in this month
    const pendingPayouts = await Payout.find({
      status: "PENDING",
      closedAt: { $gte: startDate, $lt: endDate },
    });

    if (pendingPayouts.length === 0) {
      return res.json({ message: "Is month ke liye koi pending payout nahi hai.", settled: 0 });
    }

    // Mark all as SETTLED
    const ids = pendingPayouts.map((p) => p._id);
    await Payout.updateMany(
      { _id: { $in: ids } },
      { $set: { status: "SETTLED", settledMonth: month } }
    );

    // Summary by salon
    const salonSummary = {};
    pendingPayouts.forEach((p) => {
      const sid = String(p.salonId);
      if (!salonSummary[sid]) salonSummary[sid] = { salonName: p.salonName, totalNet: 0, count: 0 };
      salonSummary[sid].totalNet += p.vendorNetPayout || 0;
      salonSummary[sid].count += 1;
    });

    res.json({
      message: `${pendingPayouts.length} payouts settled for ${month}.`,
      settled: pendingPayouts.length,
      totalAmount: pendingPayouts.reduce((s, p) => s + (p.vendorNetPayout || 0), 0),
      bySalon: Object.values(salonSummary),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
