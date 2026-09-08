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

  // Prices
  listedPrice: { type: Number, default: 0 },
  finalPrice: { type: Number, default: 0 },

  // Payment collection — where did customer pay?
  paymentCollectionMethod: {
    type: String,
    enum: ["COMPANY", "VENDOR_DIRECT", "SPLIT"],
    default: "COMPANY",
  },
  companyCollectedAmount: { type: Number, default: 0 }, // paid to Qurux
  vendorDirectAmount: { type: Number, default: 0 }, // paid directly to vendor

  // BOB wallet
  bobWalletUsed: { type: Number, default: 0 },
  emiPending: { type: Number, default: 0 },

  // GST (tax-inclusive)
  gstSlab: { type: Number, default: 18 }, // 0, 5, 12, 18, 28
  basePrice: { type: Number, default: 0 }, // price without GST
  gstAmount: { type: Number, default: 0 }, // total GST
  cgst: { type: Number, default: 0 }, // 50% of GST
  sgst: { type: Number, default: 0 }, // 50% of GST
  // Commission
  commissionRate: { type: Number, default: 10 }, // 10% platform commission
  platformCommission: { type: Number, default: 0 }, // 10% of finalPrice

  // Vendor payout calculation
  vendorGrossPayout: { type: Number, default: 0 }, // finalPrice + GST - commission
  vendorNetPayout: { type: Number, default: 0 }, // gross - vendorDirectAmount (what company owes vendor)

  // Settlement
  status: {
    type: String,
    enum: ["PENDING", "SETTLED", "PAID", "PARTIAL"],
    default: "PENDING",
    index: true,
  },
  paidAmount: { type: Number, default: 0 },
  paidAt: { type: Date },
  paidVia: { type: String, default: "" }, // BANK, CASH, UPI
  transactionRef: { type: String, default: "" },
  settledMonth: { type: String, default: "" }, // "2026-09" format

  // Admin notes
  adminRemarks: { type: String, default: "" },

  closedAt: { type: Date, default: Date.now },
}, { timestamps: true });

payoutSchema.index({ salonId: 1, status: 1 });
payoutSchema.index({ bookingId: 1 }, { unique: true }); // one payout per booking
payoutSchema.index({ salonId: 1, settledMonth: 1 }); // monthly settlement queries

module.exports = mongoose.model("Payout", payoutSchema);
