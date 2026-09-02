const mongoose = require("mongoose");

// Individual deposit - each deposit tracked separately
const depositSchema = new mongoose.Schema({
  originalAmount: { type: Number, required: true },
  depositDate: { type: Date, default: Date.now },
  usedAmount: { type: Number, default: 0 },
  benefitEnabled: { type: Boolean, default: true }, // false if used before 30 days
  status: {
    type: String,
    enum: ["ACTIVE", "USED", "FROZEN"],
    default: "ACTIVE",
  },
  reference: { type: String, default: "" }, // payment ID
});

const walletSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    accountNumber: { type: String, required: true, unique: true },

    deposits: [depositSchema],

    // Promotional balance (admin can credit)
    promotionalBalance: { type: Number, default: 0 },
    promotionalHistory: [
      {
        amount: Number,
        description: String,
        creditedAt: { type: Date, default: Date.now },
        creditedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],

    // Usage history (FIFO)
    usageHistory: [
      {
        amount: Number,
        description: String,
        date: { type: Date, default: Date.now },
        balanceAfter: Number,
      },
    ],
  },
  { timestamps: true }
);

walletSchema.index({ customerId: 1 });

module.exports = mongoose.model("Wallet", walletSchema);
