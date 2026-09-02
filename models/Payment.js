const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Reference
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    referenceType: {
      type: String,
      enum: ["BOOKING", "ORDER", "EMI", "WALLET"],
      required: true,
    },
    referenceName: { type: String, default: "" },

    // Amount
    amount: { type: Number, required: true },
    method: {
      type: String,
      enum: ["UPI", "CASH", "BOB", "CARD", "NET_BANKING"],
      default: "UPI",
    },

    // UPI details
    transactionId: { type: String, default: "" },
    upiId: { type: String, default: "" },
    screenshotUrl: { type: String, default: "" },

    // Status
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    approvedAt: { type: Date },
    rejectionReason: { type: String, default: "" },
  },
  { timestamps: true }
);

paymentSchema.index({ customerId: 1, createdAt: -1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
