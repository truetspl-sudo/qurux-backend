const Wallet = require("../models/Wallet");

// Benefit sirf ACTIVE deposits pe accrues hota hai (20% @30 days, +10%/month, max 100%)
function calcBenefit(deposit) {
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

  const milestonePercent = Math.min(100, 20 + Math.max(0, completedMonths - 1) * 10);
  const benefitAmount = Math.round(deposit.originalAmount * (milestonePercent / 100));
  const remaining = deposit.originalAmount - deposit.usedAmount;
  return { milestonePercent, benefitAmount, totalValue: Math.max(0, remaining + benefitAmount), monthsCompleted: completedMonths };
}

function availableBalance(wallet) {
  const activeDeps = wallet.deposits
    .filter((d) => d.status === "ACTIVE")
    .sort((a, b) => new Date(a.depositDate) - new Date(b.depositDate));
  let total = 0;
  activeDeps.forEach((dep) => {
    const benefit = calcBenefit(dep);
    total += (dep.originalAmount - dep.usedAmount) + benefit.benefitAmount;
  });
  return { activeDeps, total };
}

/**
 * BOB wallet FIFO deduction (same rule as customer /api/wallet/use).
 * Returns { ok, error?, wallet, availableAfter, txId }.
 */
async function deductWalletFIFO(customerId, amount, description) {
  const amountToUse = Math.max(0, Number(amount) || 0);
  if (amountToUse <= 0) {
    return { ok: false, error: "Wallet amount must be greater than 0." };
  }

  const wallet = await Wallet.findOne({ customerId });
  if (!wallet) {
    return { ok: false, error: "Customer ka BOB wallet nahi mila." };
  }

  const { activeDeps, total: totalAvailable } = availableBalance(wallet);
  if (amountToUse > totalAvailable) {
    return {
      ok: false,
      error: `Customer ke BOB wallet me itna balance nahi hai. Available: ₹${totalAvailable.toLocaleString("en-IN")}`,
    };
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

  const balanceAfter = Math.max(0, totalAvailable - amountToUse);
  wallet.usageHistory.push({
    amount: amountToUse,
    description: description || "Qurux Service Payment",
    date: new Date(),
    balanceAfter,
  });

  await wallet.save();
  const entry = wallet.usageHistory[wallet.usageHistory.length - 1];
  const txId = entry && entry._id ? String(entry._id) : `WAL-${Date.now()}`;

  return { ok: true, wallet, availableAfter: balanceAfter, txId };
}

module.exports = { deductWalletFIFO, availableBalance };
