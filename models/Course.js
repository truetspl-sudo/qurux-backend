const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    duration: { type: String, default: "" },
    hours: { type: String, default: "" },
    level: {
      type: String,
      enum: ["BEGINNER", "PROFESSIONAL", "ADVANCED"],
      default: "BEGINNER",
    },
    fee: { type: Number, required: true, min: 0 },
    description: { type: String, default: "" },
    image: { type: String, default: "" },
    topics: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

courseSchema.index({ level: 1, isActive: 1 });

module.exports = mongoose.model("Course", courseSchema);
