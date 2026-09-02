const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    category: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, default: 0 },
    image: { type: String, default: "" },
    images: [{ type: String }],
    description: { type: String, default: "" },
    stock: { type: Number, default: 0, min: 0 },
    sku: { type: String, default: "" },
    isActive: { type: Boolean, default: true },

    // ESSN brand
    brand: { type: String, default: "ESSN" },
    weight: { type: String, default: "" },
  },
  { timestamps: true }
);

productSchema.index({ category: 1, isActive: 1 });
// slug index already created by unique: true

module.exports = mongoose.model("Product", productSchema);
