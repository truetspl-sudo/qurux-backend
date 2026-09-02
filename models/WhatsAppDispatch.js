const mongoose = require("mongoose");

const whatsappDispatchSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
    bookingRef: { type: String, required: true },

    // Partner
    partnerName: { type: String, default: "" },
    partnerPhone: { type: String, default: "" },
    salonName: { type: String, default: "" },

    // Message
    messageText: { type: String, default: "" },

    // Status
    status: {
      type: String,
      enum: ["PENDING", "SENT", "FAILED"],
      default: "PENDING",
    },
    sentAt: { type: Date },

    // Service execution
    serviceCompleted: { type: Boolean, default: false },
    serviceCompletedAt: { type: Date },
  },
  { timestamps: true }
);

whatsappDispatchSchema.index({ bookingId: 1 });
whatsappDispatchSchema.index({ status: 1 });

module.exports = mongoose.model("WhatsAppDispatch", whatsappDispatchSchema);
