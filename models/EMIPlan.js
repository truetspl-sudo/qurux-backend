const mongoose = require("mongoose");

const emiPlanSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    purchaseType: {
      type: String,
      enum: ["SERVICE", "PRODUCT", "COURSE"],
      required: true,
    },
    purchaseName: { type: String, required: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },

    totalAmount: { type: Number, required: true },
    bobPaidAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    pendingAmount: { type: Number, required: true },

    // Payment history (flexible payments ₹10 to pending)
    paymentHistory: [
      {
        amount: Number,
        transactionId: String,
        status: {
          type: String,
          enum: ["PENDING", "APPROVED", "REJECTED"],
          default: "PENDING",
        },
        submittedAt: { type: Date, default: Date.now },
        approvedAt: Date,
        screenshotUrl: String,
      },
    ],

    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "CANCELLED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

emiPlanSchema.index({ customerId: 1, status: 1 });

module.exports = mongoose.model("EMIPlan", emiPlanSchema);
