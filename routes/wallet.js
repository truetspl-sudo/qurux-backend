const router = require("express").Router();
const Wallet = require("../models/Wallet");
const User = require("../models/User");
const { auth, adminOnly } = require("../middleware/auth");

// ── Helper: Generate BOB account number ──
function genAccountNumber() {
  return "BOB-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// ── Helper: Calculate deposit benefit ──
function calcBenefit(deposit) {
  // Benefit only accrues on ACTIVE (approved) deposits
  if (deposit.status !== "ACTIVE") {
    return { milestonePercent: 0, benefitAmount: 0, totalValue: Math.max(0, deposit.originalAmount - deposit.usedAmount), monthsCompleted: 0 };
  }
  if (!deposit.benefitEnabled) {
    return { milestonePercent: 0, benefitAmount: 0, totalValue: deposit.originalAmount - deposit.usedAmount, monthsCompleted: 0 };
  }
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(deposit.depositDate).getTime()) / 86400000));
  const completedMonths = Math.floor(ageDays / 30);

  if (ageDays < 30) {
    return { milestonePercent: 0, benefitAmount: 0, totalValue: deposit.originalAmount - deposit.usedAmount, monthsCompleted: 0 };
  }

  // 20% at 30 days, then +10%/month, max 100%
  const milestonePercent = Math.min(100, 20 + Math.max(0, completedMonths - 1) * 10);
  const benefitAmount = Math.round(deposit.originalAmount * (milestonePercent / 100));
  const remaining = deposit.originalAmount - deposit.usedAmount;
  const totalValue = remaining + benefitAmount;

  return { milestonePercent, benefitAmount, totalValue: Math.max(0, totalValue), monthsCompleted: completedMonths };
}

// ── Helper: Calculate account summary ──
function calcSummary(wallet) {
  let totalDeposited = 0, totalUsed = 0, totalBenefit = 0, eligibleSaving = 0;
  const pendingDeposits = [];
  const rejectedDeposits = [];

  const depositDetails = wallet.deposits.map((dep) => {
    const benefit = calcBenefit(dep);
    const remaining = dep.originalAmount - dep.usedAmount;
    if (dep.status === "PENDING") {
      pendingDeposits.push({ deposit: dep, benefit });
      return null;
    }
    if (dep.status === "REJECTED") {
      rejectedDeposits.push({ deposit: dep, benefit });
      return null;
    }
    totalDeposited += dep.originalAmount;
    totalUsed += dep.usedAmount;
    totalBenefit += benefit.benefitAmount;
    eligibleSaving += Math.max(0, remaining);
    return { deposit: dep, benefit };
  }).filter(Boolean);

  return {
    totalDeposited,
    totalUsed,
    totalBenefit,
    availableBalance: eligibleSaving + totalBenefit,
    eligibleSaving,
    promotionalBalance: wallet.promotionalBalance || 0,
    totalBalance: eligibleSaving + totalBenefit + (wallet.promotionalBalance || 0),
    depositDetails,
    pendingDeposits,
    rejectedDeposits,
  };
}

// ── Helper: Build bank-style statement ──
function buildStatement(wallet) {
  const entries = [];

  wallet.deposits
    .filter((dep) => dep.status !== "PENDING" && dep.status !== "REJECTED")
    .forEach((dep) => {
      entries.push({
        date: dep.depositDate,
        description: "Beauty Saving Deposit",
        credit: dep.originalAmount,
        debit: 0,
      });

      const benefit = calcBenefit(dep);
      if (benefit.milestonePercent > 0) {
        const milestones = [20, 30, 40, 50, 60, 70, 80, 90, 100];
        milestones.filter((m) => m <= benefit.milestonePercent).forEach((milestone) => {
          const prev = milestone === 20 ? 0 : milestone - 10;
          const added = Math.round(dep.originalAmount * (milestone - prev) / 100);
          const d = new Date(new Date(dep.depositDate).getTime() + ((milestone / 10) - 1) * 30 * 86400000);
          entries.push({
            date: d,
            description: milestone === 20 ? "20% Beauty Benefit" : `Additional 10% Benefit (${milestone}%)`,
            credit: added,
            debit: 0,
          });
        });
      }
    });

  (wallet.usageHistory || []).forEach((u) => {
    entries.push({ date: u.date, description: u.description || "Qurux Purchase", credit: 0, debit: u.amount });
  });

  (wallet.promotionalHistory || []).forEach((p) => {
    entries.push({ date: p.creditedAt, description: p.description || "Promotional Credit", credit: p.amount, debit: 0 });
  });

  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  let running = 0;
  return entries.map((e) => {
    running += e.credit - e.debit;
    return {
      date: new Date(e.date).toLocaleDateString("en-IN"),
      description: e.description,
      credit: e.credit,
      debit: e.debit,
      balance: running,
    };
  });
}

// ── GET /api/wallet/me - Get my wallet ──
router.get("/me", auth, async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ customerId: req.user._id });
    if (!wallet) {
      wallet = await Wallet.create({
        customerId: req.user._id,
        accountNumber: genAccountNumber(),
        deposits: [],
      });
    }

    const summary = calcSummary(wallet);
    const statement = buildStatement(wallet);

    res.json({ wallet, summary, statement });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── POST /api/wallet/deposit - Submit deposit request (admin must approve) ──
router.post("/deposit", auth, async (req, res) => {
  try {
    const { amount, reference, screenshotUrl } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Valid deposit amount required" });
    }
    if (!reference) {
      return res.status(400).json({ message: "UPI Transaction ID / UTR required" });
    }

    let wallet = await Wallet.findOne({ customerId: req.user._id });
    if (!wallet) {
      wallet = await Wallet.create({
        customerId: req.user._id,
        accountNumber: genAccountNumber(),
        deposits: [],
      });
    }

    wallet.deposits.push({
      originalAmount: amount,
      depositDate: new Date(),
      submittedAt: new Date(),
      usedAmount: 0,
      benefitEnabled: true,
      status: "PENDING",
      reference: reference.trim(),
      screenshotUrl: screenshotUrl || "",
    });

    await wallet.save();
    const summary = calcSummary(wallet);

    res.json({ message: `₹${amount} deposit request submitted. Admin approval ke baad balance credit hoga.`, wallet, summary });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/wallet/requests - Admin: pending deposit requests ──
router.get("/requests", auth, adminOnly, async (req, res) => {
  try {
    const wallets = await Wallet.find({ deposits: { $elemMatch: { status: "PENDING" } } })
      .populate("customerId", "fullName mobile email");

    const requests = [];
    wallets.forEach((wallet) => {
      wallet.deposits
        .filter((d) => d.status === "PENDING")
        .forEach((dep) => {
          requests.push({
            requestId: dep._id,
            walletId: wallet._id,
            customerId: wallet.customerId?._id,
            customerName: wallet.customerId?.fullName || "Customer",
            mobile: wallet.customerId?.mobile || "",
            accountNumber: wallet.accountNumber,
            amount: dep.originalAmount,
            reference: dep.reference || "",
            screenshotUrl: dep.screenshotUrl || "",
            submittedAt: dep.submittedAt || dep.depositDate,
          });
        });
    });
    requests.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── PATCH /api/wallet/:walletId/deposits/:depositId/approve - Admin ──
router.patch("/:walletId/deposits/:depositId/approve", auth, adminOnly, async (req, res) => {
  try {
    const wallet = await Wallet.findById(req.params.walletId);
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    const deposit = wallet.deposits.id(req.params.depositId);
    if (!deposit) return res.status(404).json({ message: "Deposit not found" });
    if (deposit.status !== "PENDING") {
      return res.status(400).json({ message: "Only PENDING deposits can be approved" });
    }

    // Benefit clock starts from approval date
    deposit.status = "ACTIVE";
    deposit.approvedAt = new Date();
    deposit.depositDate = new Date();
    await wallet.save();

    res.json({ message: `₹${deposit.originalAmount} deposit approved & credited to BOB` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── PATCH /api/wallet/:walletId/deposits/:depositId/reject - Admin ──
router.patch("/:walletId/deposits/:depositId/reject", auth, adminOnly, async (req, res) => {
  try {
    const wallet = await Wallet.findById(req.params.walletId);
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    const deposit = wallet.deposits.id(req.params.depositId);
    if (!deposit) return res.status(404).json({ message: "Deposit not found" });
    if (deposit.status !== "PENDING") {
      return res.status(400).json({ message: "Only PENDING deposits can be rejected" });
    }

    deposit.status = "REJECTED";
    await wallet.save();

    res.json({ message: "Deposit request rejected" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── POST /api/wallet/use - Use from BOB (FIFO) ──
router.post("/use", auth, async (req, res) => {
  try {
    const { amount, description } = req.body;
    const amountToUse = Math.max(0, Number(amount) || 0);

    if (amountToUse <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0" });
    }

    const wallet = await Wallet.findOne({ customerId: req.user._id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    // Sort deposits oldest first (FIFO)
    const activeDeps = wallet.deposits
      .filter((d) => d.status === "ACTIVE")
      .sort((a, b) => new Date(a.depositDate) - new Date(b.depositDate));

    // Calculate total available
    let totalAvailable = 0;
    activeDeps.forEach((dep) => {
      const benefit = calcBenefit(dep);
      totalAvailable += (dep.originalAmount - dep.usedAmount) + benefit.benefitAmount;
    });

    if (amountToUse > totalAvailable) {
      return res.status(400).json({ message: `Insufficient balance. Available: ₹${totalAvailable}` });
    }

    // FIFO deduction
    let remaining = amountToUse;
    for (const dep of activeDeps) {
      if (remaining <= 0) break;
      const benefit = calcBenefit(dep);
      const available = (dep.originalAmount - dep.usedAmount) + benefit.benefitAmount;
      if (available <= 0) continue;

      const toDeduct = Math.min(remaining, available);

      // 30-day rule
      const ageDays = Math.floor((Date.now() - new Date(dep.depositDate).getTime()) / 86400000);
      if (ageDays < 30) {
        dep.benefitEnabled = false;
      }

      dep.usedAmount += toDeduct;
      remaining -= toDeduct;

      if (dep.usedAmount >= dep.originalAmount) {
        dep.status = "USED";
      }
    }

    wallet.usageHistory.push({
      amount: amountToUse,
      description: description || "Qurux Purchase",
      date: new Date(),
      balanceAfter: totalAvailable - amountToUse,
    });

    await wallet.save();
    const summary = calcSummary(wallet);

    res.json({ message: `₹${amountToUse} used from BOB (FIFO)`, summary });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── POST /api/wallet/promotional - Admin credit promotional balance ──
router.post("/promotional", auth, adminOnly, async (req, res) => {
  try {
    const { customerId, amount, description } = req.body;
    if (!customerId || !amount) {
      return res.status(400).json({ message: "Customer ID and amount required" });
    }

    let wallet = await Wallet.findOne({ customerId });
    if (!wallet) {
      wallet = await Wallet.create({ customerId, accountNumber: genAccountNumber() });
    }

    wallet.promotionalBalance += Number(amount);
    wallet.promotionalHistory.push({
      amount: Number(amount),
      description: description || "Promotional Credit",
      creditedAt: new Date(),
      creditedBy: req.user._id,
    });

    await wallet.save();
    res.json({ message: `₹${amount} promotional balance credited`, wallet });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/wallet/all - Admin: all wallets ──
router.get("/all", auth, adminOnly, async (req, res) => {
  try {
    const wallets = await Wallet.find().populate("customerId", "fullName mobile email bobAccountNumber");
    res.json(wallets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/wallet/balance - Quick balance check ──
router.get("/balance", auth, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ customerId: req.user._id });
    if (!wallet) return res.json({ balance: 0 });
    const summary = calcSummary(wallet);
    res.json({ balance: summary.totalBalance, accountNumber: wallet.accountNumber });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
