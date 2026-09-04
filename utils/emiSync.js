const EMIPlan = require("../models/EMIPlan");

/**
 * RULE (manual model — master note):
 * FULL payment close → customer ka due ₹0 (koi EMI plan nahi chahiye).
 * EMI mode close → customer ke EMI details me dikhna chahiye: kaun si
 * cheez li (purchaseName), total kitna, kitna pay ho chuka, kitna balance.
 *
 * Jab admin kisi booking/order ko EMI mode me close/pay karta hai to yahan
 * customer ke liye EMIPlan BANTA/UPDATE hota hai (bookingId/orderId se linked).
 * Flexible repayments baad me /emi/:id/pay → admin approve se pending ghatta hai.
 */
async function syncEMIPlanFromPayment({
  refType, // "booking" | "order"
  doc, // mongoose Booking / Order document
  purchaseType, // "SERVICE" | "PRODUCT" | "COURSE"
  purchaseName,
  collectedAmount, // admin ne abhi kitna cash/UPI liya (closure/pay time)
}) {
  const totalAmount = Math.max(0, Number(doc.amount ?? doc.total ?? 0) || 0);
  const bobAlready = Math.min(totalAmount, Math.max(0, Number(doc.bobPaidAmount) || 0));
  const collected = Math.min(
    Math.max(0, totalAmount - bobAlready),
    Math.max(0, Number(collectedAmount) || 0)
  );

  const filter =
    refType === "booking" ? { bookingId: doc._id } : { orderId: doc._id };
  let plan = await EMIPlan.findOne(filter);

  const existingBob = plan ? Math.max(0, Number(plan.bobPaidAmount) || 0) : bobAlready;
  const existingPaid = plan ? Math.max(0, Number(plan.paidAmount) || 0) : 0;
  const paid = Math.min(totalAmount - existingBob, Math.max(existingPaid, collected));
  const pending = Math.max(0, totalAmount - existingBob - paid);

  if (pending > 0) {
    const data = {
      customerId: doc.customerId,
      purchaseType,
      purchaseName,
      totalAmount,
      bobPaidAmount: existingBob,
      paidAmount: paid,
      pendingAmount: pending,
      status: "ACTIVE",
    };
    if (refType === "booking") data.bookingId = doc._id;
    else data.orderId = doc._id;

    if (plan) {
      Object.assign(plan, data);
      await plan.save();
    } else {
      await EMIPlan.create(data);
    }
    return { pending, paid, created: !plan };
  }

  // Sab kuch paid (due zero) → plan hota hai to COMPLETED karo, nahi to kuch mat banao
  if (plan) {
    plan.pendingAmount = 0;
    plan.paidAmount = Math.min(
      plan.totalAmount - plan.bobPaidAmount,
      Math.max(Number(plan.paidAmount) || 0, collected)
    );
    plan.status =
      plan.paidAmount + plan.bobPaidAmount >= plan.totalAmount ? "COMPLETED" : "ACTIVE";
    await plan.save();
  }
  return { pending: 0, paid, created: false };
}

module.exports = { syncEMIPlanFromPayment };
