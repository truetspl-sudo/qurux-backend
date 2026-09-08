const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema({
  salonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Salon",
    required: true,
    index: true,
  },
  salonName: { type: String, default: "" },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true,
    index: true,
  },
  bookingCode: { type: String, default: "" },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  customerName: { type: String, default: "" },
  serviceName: { type: String, default: "" },

  // What admin collected from customer
  finalPrice: { type: Number, default: 0 },
  cashCollected: { type: Number, default: 0 },
  bobWalletUsed: { type: Number, default: 0 },
  emiPending: { type: Number, default: 0 },

  // Salon partner commission / share (admin sets this)
  salonShare: { type: Number, default: 0 },
  commissionRate: { type: Number, default: 0 }, // percentage (e.g. 20 = 20%)

  // Payout status
  status: {
    type: String,
    enum: ["PENDING", "PAID", "PARTIAL"],
    default: "PENDING",
    index: true,
  },
  paidAmount: { type: Number, default: 0 },
  paidAt: { type: Date },
  paidVia: { type: String, default: "" }, // BANK, CASH, UPI
  transactionRef: { type: String, default: "" },

  // Admin notes
  adminRemarks: { type: String, default: "" },

  closedAt: { type: Date, default: Date.now },
}, { timestamps: true });

payoutSchema.index({ salonId: 1, status: 1 });
payoutSchema.index({ bookingId: 1 }, { unique: true }); // one payout per booking

module.exports = mongoose.model("Payout", payoutSchema);
