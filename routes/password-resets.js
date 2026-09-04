const router = require("express").Router();
const User = require("../models/User");
const PasswordReset = require("../models/PasswordReset");
const { auth, adminOnly } = require("../middleware/auth");

// GET /api/password-resets — admin queue (PENDING first)
router.get("/", auth, adminOnly, async (req, res) => {
  try {
    const requests = await PasswordReset.find()
      .sort({ status: 1, createdAt: -1 })
      .populate("userIdRef", "fullName mobile userId status");
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/password-resets/:id/approve — admin approve
router.patch("/:id/approve", auth, adminOnly, async (req, res) => {
  try {
    const reset = await PasswordReset.findById(req.params.id);
    if (!reset) return res.status(404).json({ message: "Reset request not found" });
    if (reset.status !== "PENDING") {
      return res.status(400).json({ message: "Reset request already " + reset.status });
    }

    const user = await User.findById(reset.userIdRef);
    if (!user) return res.status(404).json({ message: "User not found" });

    // updateOne se password set karo — pre('save') hash hook NAHI chalta
    // (hash already request me store hai), warna double-hash ho jata.
    await User.updateOne({ _id: user._id }, { $set: { password: reset.newPasswordHash } });

    reset.status = "APPROVED";
    reset.approvedAt = new Date();
    reset.adminRemarks = req.body.adminRemarks || "";
    await reset.save();

    res.json({
      message: `Password reset approved! ${user.userId} ab naye password se login kar sakta hai.`,
      reset,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/password-resets/:id/reject — admin reject
router.patch("/:id/reject", auth, adminOnly, async (req, res) => {
  try {
    const reset = await PasswordReset.findById(req.params.id);
    if (!reset) return res.status(404).json({ message: "Reset request not found" });
    if (reset.status !== "PENDING") {
      return res.status(400).json({ message: "Reset request already " + reset.status });
    }
    reset.status = "REJECTED";
    reset.adminRemarks = req.body.adminRemarks || "";
    await reset.save();
    res.json({ message: "Password reset request rejected", reset });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
