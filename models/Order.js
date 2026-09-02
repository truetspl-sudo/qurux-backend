const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Items
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        name: String,
        price: Number,
        quantity: Number,
        image: String,
      },
    ],

    // Amounts
    subtotal: { type: Number, required: true },
    shipping: { type: Number, default: 0 },
    total: { type: Number, required: true },

    // Delivery
    deliveryAddress: { type: String, default: "" },
    city: { type: String, default: "" },
    pincode: { type: String, default: "" },

    // Payment
    paymentMethod: {
      type: String,
      enum: ["FULL", "EMI", "BOB", "MIXED"],
      default: "FULL",
    },
    bobPaidAmount: { type: Number, default: 0 },
    cashAmount: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "PARTIAL", "REFUNDED"],
      default: "PENDING",
    },

    // Status
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"],
      default: "PENDING",
    },

    // Customer info
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
  },
  { timestamps: true }
);

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

module.exports = mongoose.model("Order", orderSchema);
