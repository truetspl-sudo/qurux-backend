const router = require("express").Router();
const Salon = require("../models/Salon");
const Service = require("../models/Service");
const Rating = require("../models/Rating");
const { auth, adminOnly } = require("../middleware/auth");

// Rating summary (stars avg + count) for salon(s)
async function attachRatings(salons) {
  const ids = salons.map((s) => s._id);
  const agg = await Rating.aggregate([
    { $match: { targetType: "SALON", targetId: { $in: ids } } },
    { $group: { _id: "$targetId", avg: { $avg: "$stars" }, count: { $sum: 1 } } },
  ]);
  const map = {};
  agg.forEach((r) => {
    map[String(r._id)] = { stars: Math.round(r.avg * 10) / 10, count: r.count };
  });
  return salons.map((s) => ({
    ...s.toObject(),
    slug: s.slug || `${String(s.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${String(s.city || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    rating: map[String(s._id)] || { stars: 0, count: 0 },
  }));
}

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

// GET /api/salons - Public approved salons (list w/ star rating, name, location)
router.get("/", async (req, res) => {
  try {
    const { city, search } = req.query;
    const filter = { status: "APPROVED" };

    if (city) filter.city = { $regex: city, $options: "i" };
    if (search) filter.name = { $regex: search, $options: "i" };

    const salons = await Salon.find(filter).sort({ name: 1 });
    res.json(await attachRatings(salons));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/salons/all - Admin (must come BEFORE /:slug so it isn't swallowed)
router.get("/all", auth, adminOnly, async (req, res) => {
  try {
    const salons = await Salon.find().sort({ createdAt: -1 });
    res.json(salons);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/salons/:slug - Public salon detail + services + reviews
router.get("/:slug", async (req, res) => {
  try {
    let salon = await Salon.findOne({ slug: req.params.slug });
    if (!salon) {
      try {
        salon = await Salon.findById(req.params.slug);
      } catch {
        salon = null;
      }
    }
    if (!salon) {
      salon = await Salon.findOne({ name: req.params.slug, status: "APPROVED" });
    }
    if (!salon) return res.status(404).json({ message: "Salon not found" });
    if (salon.status !== "APPROVED") return res.status(404).json({ message: "Salon not available" });

    // Services: sirf wahi services jo admin/vendor ne is salon ko assign ki hain
    // (servicesIds). Full-catalog fallback nahi — partner salon ki apni list dikhe.
    let services = [];
    if (salon.servicesIds && salon.servicesIds.length) {
      services = await Service.find({ _id: { $in: salon.servicesIds }, isActive: true });
    }
    services = services.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const reviews = await Rating.find({ targetType: "SALON", targetId: salon._id }).sort({ createdAt: -1 });
    const agg = await Rating.aggregate([
      { $match: { targetType: "SALON", targetId: salon._id } },
      { $group: { _id: null, avg: { $avg: "$stars" }, count: { $sum: 1 } } },
    ]);

    const base = await attachRatings([salon]);
    res.json({
      salon: base[0],
      rating: agg[0] ? { stars: Math.round(agg[0].avg * 10) / 10, count: agg[0].count } : { stars: 0, count: 0 },
      services,
      reviews,
      usingFullCatalog: !(salon.servicesIds && salon.servicesIds.length),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/salons/:id - Admin manage (images, work images, map, services, about)
router.patch("/:id", auth, adminOnly, async (req, res) => {
  try {
    const salon = await Salon.findById(req.params.id);
    if (!salon) return res.status(404).json({ message: "Salon not found" });

    const allowed = [
      "name", "type", "address", "city", "pincode", "gstNumber", "image",
      "images", "workImages", "googleMapUrl", "servicesIds", "servicesOffered",
      "about", "ownerName", "ownerMobile", "alternatePhone", "yearsOfExperience",
      "teamSize",
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (Array.isArray(req.body[key])) {
          salon[key] = req.body[key].filter(Boolean);
        } else {
          salon[key] = req.body[key];
        }
      }
    }
    await salon.save();
    res.json({ message: "Salon updated", salon });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/salons/:id/approve
router.patch("/:id/approve", auth, adminOnly, async (req, res) => {
  try {
    const salon = await Salon.findById(req.params.id);
    if (!salon) return res.status(404).json({ message: "Salon not found" });
    salon.status = "APPROVED";
    salon.approvedAt = new Date();
    await salon.save();
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
