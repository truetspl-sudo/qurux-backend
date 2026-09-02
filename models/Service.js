const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    category: { type: String, required: true },
    subcategory: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    duration: { type: String, default: "60 min" },
    description: { type: String, default: "" },
    image: { type: String, default: "" },
    includes: [{ type: String }],
    isActive: { type: Boolean, default: true },

    // For bridal subcategories
    parentService: { type: String, default: "" },
  },
  { timestamps: true }
);

serviceSchema.index({ category: 1, isActive: 1 });
// slug index already created by unique: true

module.exports = mongoose.model("Service", serviceSchema);
