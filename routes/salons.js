const router = require("express").Router();
const Salon = require("../models/Salon");
const { auth, adminOnly } = require("../middleware/auth");

// POST /api/salons/register - Salon registration
router.post("/register", async (req, res) => {
  try {
    const salon = await Salon.create(req.body);
    res.status(201).json({
      message: "Registration submitted. Waiting for admin approval.",
      salon,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/salons - Public approved salons
router.get("/", async (req, res) => {
  try {
    const { city, search } = req.query;
    const filter = { status: "APPROVED" };

    if (city) filter.city = { $regex: city, $options: "i" };
    if (search) filter.name = { $regex: search, $options: "i" };

    const salons = await Salon.find(filter).sort({ name: 1 });
    res.json(salons);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/salons/all - Admin
router.get("/all", auth, adminOnly, async (req, res) => {
  try {
    const salons = await Salon.find().sort({ createdAt: -1 });
    res.json(salons);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/salons/:id/approve
router.patch("/:id/approve", auth, adminOnly, async (req, res) => {
  try {
    const salon = await Salon.findByIdAndUpdate(
      req.params.id,
      { status: "APPROVED", approvedAt: new Date() },
      { new: true }
    );
    if (!salon) return res.status(404).json({ message: "Salon not found" });
    res.json({ message: "Salon approved", salon });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/salons/:id/reject
router.patch("/:id/reject", auth, adminOnly, async (req, res) => {
  try {
    const { reason } = req.body;
    const salon = await Salon.findByIdAndUpdate(
      req.params.id,
      { status: "REJECTED", rejectionReason: reason || "" },
      { new: true }
    );
    if (!salon) return res.status(404).json({ message: "Salon not found" });
    res.json({ message: "Salon rejected", salon });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
