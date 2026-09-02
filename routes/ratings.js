const router = require("express").Router();
const Rating = require("../models/Rating");
const { auth, adminOnly } = require("../middleware/auth");

// POST /api/ratings - Submit rating
router.post("/", auth, async (req, res) => {
  try {
    const { targetType, targetId, targetName, stars, customerRemarks, bookingId } = req.body;

    if (!targetType || !targetName || !stars) {
      return res.status(400).json({ message: "Target type, name, and stars required" });
    }

    const rating = await Rating.create({
      customerId: req.user._id,
      customerName: req.user.fullName,
      targetType,
      targetId: targetId || undefined,
      targetName,
      bookingId: bookingId || undefined,
      stars: Math.min(5, Math.max(1, Number(stars))),
      customerRemarks: customerRemarks || "",
    });

    res.status(201).json({ message: "Rating submitted", rating });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/ratings - All public ratings or admin
router.get("/", async (req, res) => {
  try {
    const { targetType, targetId } = req.query;
    const filter = {};
    if (targetType) filter.targetType = targetType;
    if (targetId) filter.targetId = targetId;

    const ratings = await Rating.find(filter).sort({ createdAt: -1 });
    res.json(ratings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/ratings/my - My ratings
router.get("/my", auth, async (req, res) => {
  try {
    const ratings = await Rating.find({ customerId: req.user._id }).sort({ createdAt: -1 });
    res.json(ratings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/ratings/:id/admin-remark - Admin add remark during closure
router.patch("/:id/admin-remark", auth, adminOnly, async (req, res) => {
  try {
    const { adminRemarks } = req.body;
    const rating = await Rating.findByIdAndUpdate(
      req.params.id,
      { adminRemarks: adminRemarks || "", isAdminClosed: true },
      { new: true }
    );
    if (!rating) return res.status(404).json({ message: "Rating not found" });
    res.json({ message: "Admin remarks added", rating });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
