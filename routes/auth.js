const router = require("express").Router();
const User = require("../models/User");
const { generateToken, auth } = require("../middleware/auth");

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { fullName, email, mobile, password } = req.body;

    if (!fullName || !mobile || !password) {
      return res.status(400).json({ message: "Name, mobile and password are required" });
    }

    // Check mobile unique
    const exists = await User.findOne({ mobile });
    if (exists) {
      return res.status(400).json({ message: "Mobile number already registered" });
    }

    const user = await User.create({ fullName, email: email || "", mobile, password });
    const token = generateToken(user._id);

    res.status(201).json({
      message: "Registration successful. Waiting for admin approval. Admin will provide your User ID.",
      token,
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/auth/login — login with userId + password
router.post("/login", async (req, res) => {
  try {
    const { userId, password } = req.body;

    if (!userId || !password) {
      return res.status(400).json({ message: "User ID and password required" });
    }

    const user = await User.findOne({ userId: userId.trim().toUpperCase() });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.status !== "APPROVED") {
      return res.status(403).json({ message: "Account not yet approved. Please wait for admin approval.", status: user.status });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      message: "Login successful",
      token,
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/auth/me
router.get("/me", auth, async (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/profile
router.put("/profile", auth, async (req, res) => {
  try {
    const { fullName, dob, address, avatar } = req.body;
    const user = await User.findById(req.user._id);

    if (fullName) user.fullName = fullName;
    if (dob) user.dob = dob;
    if (address) user.address = address;
    if (avatar) user.avatar = avatar;

    await user.save();
    res.json({ message: "Profile updated", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/auth/change-password — update own password (admin or customer)
router.put("/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    user.password = newPassword;
    await user.save(); // pre-save hook re-hashes the password

    res.json({ message: "Password updated successfully. Use your new password on next login." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
