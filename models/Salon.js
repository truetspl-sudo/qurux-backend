const mongoose = require("mongoose");

const salonSchema = new mongoose.Schema(
  {
    // Salon Details
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["UNISEX", "WOMENS", "MENS", "HOME_STUDIO", "MAKEUP_STUDIO"],
      default: "UNISEX",
    },
    address: { type: String, required: true },
    city: { type: String, required: true },
    pincode: { type: String, required: true },
    gstNumber: { type: String, default: "" },
    image: { type: String, default: "" },

    // Owner Details
    ownerName: { type: String, required: true },
    ownerEmail: { type: String, required: true, lowercase: true },
    ownerMobile: { type: String, required: true },
    alternatePhone: { type: String, default: "" },

    // Business Info
    yearsOfExperience: { type: Number, default: 0 },
    teamSize: { type: Number, default: 1 },
    servicesOffered: [{ type: String }],
    about: { type: String, default: "" },

    // Linked User Account
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Approval
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

salonSchema.index({ status: 1 });
salonSchema.index({ city: 1 });

module.exports = mongoose.model("Salon", salonSchema);
