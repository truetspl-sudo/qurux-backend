const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, default: "", lowercase: true, trim: true },
    mobile: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    dob: { type: String, default: "" },
    address: { type: String, default: "" },

    role: {
      type: String,
      enum: ["CUSTOMER", "ADMIN", "SALON_OWNER"],
      default: "CUSTOMER",
    },

    // Customer approval
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    // Unique User ID (assigned by admin on approval). NOTE: no default —
    // leaving it unset keeps the sparse unique index from colliding on ""
    // (a default of "" made every pending signup duplicate-key error).
    userId: { type: String, unique: true, sparse: true },

    // BOB
    bobAccountNumber: { type: String, default: "" },
    bobStatus: {
      type: String,
      enum: ["NONE", "PENDING", "APPROVED", "REJECTED"],
      default: "NONE",
    },

    // Profile
    avatar: { type: String, default: "" },

    // Timestamps
    approvedAt: { type: Date },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Remove password from JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
