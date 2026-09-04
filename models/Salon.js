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

    // Public salon page (partner/manage fields)
    slug: { type: String, lowercase: true, unique: true, sparse: true },
    images: [{ type: String }], // salon ki images (gallery)
    workImages: [{ type: String }], // salon ka kaam / work photos
    googleMapUrl: { type: String, default: "" }, // Google Maps link / embed
    servicesIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Service" }], // is salon me available services

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
salonSchema.index({ slug: 1 });

// Slug apne aap name+city se banao (salon page URL ke liye)
salonSchema.pre("save", function (next) {
  if (this.isModified("name") || this.isModified("city") || !this.slug) {
    const namePart = String(this.name || "salon")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const cityPart = String(this.city || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    this.slug = `${namePart}-${cityPart}`.replace(/-+$/g, "").slice(0, 80) || `salon-${this._id}`;
  }
  next();
});

module.exports = mongoose.model("Salon", salonSchema);
