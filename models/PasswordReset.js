const mongoose = require("mongoose");

/**
 * Password reset request — RULE (master note):
 * Customer ko current/pura password dene ki zaroorat NAHI. Wo User ID + naya
 * password dalta hai → yahan PENDING request banti hai → admin dashboard pe
 * approve/reject karta hai → approve par user ka password replace ho jata hai,
 * phir customer naye password se login karta hai.
 * Sirf naye password ka HASH store hota hai (plaintext kabhi nahi).
 */
const passwordResetSchema = new mongoose.Schema(
  {
    userIdRef: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userId: { type: String, required: true }, // snapshot: QUR-xxxx
    fullName: { type: String, default: "" },
    mobile: { type: String, default: "" },
    newPasswordHash: { type: String, required: true },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    approvedAt: { type: Date },
    adminRemarks: { type: String, default: "" },
  },
  { timestamps: true }
);

passwordResetSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("PasswordReset", passwordResetSchema);
