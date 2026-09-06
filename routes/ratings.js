const router = require("express").Router();
const Rating = require("../models/Rating");
const Booking = require("../models/Booking");
const Salon = require("../models/Salon");
const { auth, adminOnly } = require("../middleware/auth");

// POST /api/ratings - Customer rates a COMPLETED service booking
// Rating targetType SALON hota hai → partner salon ki list/detail me dikhta hai
router.post("/", auth, async (req, res) => {
  try {
    const { bookingId, stars, customerRemarks } = req.body;

    if (!bookingId) {
      return res.status(400).json({ message: "Booking ID required" });
    }
    if (!stars || Number(stars) < 1 || Number(stars) > 5) {
      return res.status(400).json({ message: "Stars (1-5) required" });
    }

    // Booking sirf customer ki apni + COMPLETED ho tab hi rating milegi
    let booking = null;
    try { booking = await Booking.findById(bookingId); } catch {}
    if (!booking) booking = await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (String(booking.customerId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Ye booking aapki nahi hai." });
    }
    if (booking.status !== "COMPLETED") {
      return res.status(400).json({ message: "Service complete hone ke baad hi rating de sakte hain." });
    }

    const ratingValue = Math.min(5, Math.max(1, Number(stars)));
    const remarks = (customerRemarks || "").trim();

    // Salon target (partner ki list/detail pe dikhega) — upsert by booking
    let targetType = "SALON";
    let targetId = booking.salonId || undefined;
    let targetName = booking.salonName || "QURUX Salon";

    // Agar salonId hai to verify salon exists; home service ke liye bhi salon name
    if (booking.salonId) {
      const salon = await Salon.findById(booking.salonId);
      if (salon) targetName = salon.name;
    }

    const rating = await Rating.findOneAndUpdate(
      { bookingId: booking._id, customerId: req.user._id, targetType: "SALON" },
      {
        customerId: req.user._id,
        customerName: req.user.fullName,
        targetType,
        targetId: targetId || undefined,
        targetName,
        bookingId: booking._id,
        stars: ratingValue,
        customerRemarks: remarks,
        isAdminClosed: false,
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: "Rating submitted — thank you!", rating });
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

// PATCH /api/ratings/:id - Admin edit rating/review (stars, remarks)
router.patch("/:id", auth, adminOnly, async (req, res) => {
  try {
    const { stars, customerRemarks, adminRemarks } = req.body;
    const rating = await Rating.findById(req.params.id);
    if (!rating) return res.status(404).json({ message: "Rating not found" });

    if (stars !== undefined && Number(stars) >= 1 && Number(stars) <= 5) {
      rating.stars = Number(stars);
    }
    if (customerRemarks !== undefined) rating.customerRemarks = customerRemarks || "";
    if (adminRemarks !== undefined) rating.adminRemarks = adminRemarks || "";
    await rating.save();

    res.json({ message: "Rating updated", rating });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/ratings/:id - Admin delete review
router.delete("/:id", auth, adminOnly, async (req, res) => {
  try {
    const rating = await Rating.findByIdAndDelete(req.params.id);
    if (!rating) return res.status(404).json({ message: "Rating not found" });
    res.json({ message: "Review deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
