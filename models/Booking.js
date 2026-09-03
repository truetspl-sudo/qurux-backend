const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    // Auto-generated
    bookingId: { type: String, required: true, unique: true },

    // Customer
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Service
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
    serviceName: { type: String, required: true },
    serviceCategory: { type: String, default: "" },

    // Location
    serviceLocation: {
      type: String,
      enum: ["HOME", "SALON"],
      required: true,
    },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    pincode: { type: String, default: "" },

    // Salon (if SALON location)
    salonId: { type: mongoose.Schema.Types.ObjectId, ref: "Salon" },
    salonName: { type: String, default: "" },

    // Date & Time
    date: { type: String, required: true },
    timeSlot: { type: String, default: "" },

    // Customer Details
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerEmail: { type: String, default: "" },

    // Payment
    amount: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ["FULL", "EMI", "BOB", "MIXED"],
      default: "FULL",
    },
    bobPaidAmount: { type: Number, default: 0 },
    cashAmount: { type: Number, default: 0 },
    emiAmount: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "PARTIAL", "REFUNDED"],
      default: "PENDING",
    },
    // Manual model: admin closure pe batata hai customer ne kis mode me pay kiya
    paidVia: { type: String, default: "CASH" }, // CASH | UPI | BOB | EMI

    // Status
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "PENDING",
    },

    // WhatsApp
    whatsappDispatched: { type: Boolean, default: false },
    whatsappSentAt: { type: Date },

    // Admin Closure
    closedAt: { type: Date },
    adminRemarks: { type: String, default: "" },
    customerRemarks: { type: String, default: "" },
    rating: { type: Number, min: 0, max: 5, default: 0 },

    // Home service minimum check
    meetsMinAmount: { type: Boolean, default: true },

    // Notes
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

bookingSchema.index({ customerId: 1, createdAt: -1 });
bookingSchema.index({ status: 1 });
// bookingId index already created by unique: true

module.exports = mongoose.model("Booking", bookingSchema);
