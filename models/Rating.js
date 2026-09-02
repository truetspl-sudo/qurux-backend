const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    customerName: { type: String, required: true },

    // What's being rated
    targetType: {
      type: String,
      enum: ["SERVICE", "PRODUCT", "COURSE", "SALON"],
      required: true,
    },
    targetId: { type: mongoose.Schema.Types.ObjectId },
    targetName: { type: String, required: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },

    // Rating
    stars: { type: Number, required: true, min: 1, max: 5 },
    customerRemarks: { type: String, default: "" },
    adminRemarks: { type: String, default: "" },

    // Admin-linked (from service closure)
    isAdminClosed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ratingSchema.index({ targetType: 1, targetId: 1 });
ratingSchema.index({ customerId: 1 });

module.exports = mongoose.model("Rating", ratingSchema);
