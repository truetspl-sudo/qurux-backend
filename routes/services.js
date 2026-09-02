const router = require("express").Router();
const Service = require("../models/Service");
const { auth, adminOnly } = require("../middleware/auth");

// GET /api/services - Public listing
router.get("/", async (req, res) => {
  try {
    const { category, search } = req.query;
    const filter = { isActive: true };

    if (category && category !== "All") {
      filter.category = category;
    }
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const services = await Service.find(filter).sort({ category: 1, name: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/services/all - Admin listing (includes inactive)
router.get("/all", auth, adminOnly, async (req, res) => {
  try {
    const services = await Service.find().sort({ category: 1, name: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/services/:slug
router.get("/:slug", async (req, res) => {
  try {
    const service = await Service.findOne({ slug: req.params.slug });
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/services - Admin create
router.post("/", auth, adminOnly, async (req, res) => {
  try {
    const service = await Service.create(req.body);
    res.status(201).json({ message: "Service created", service });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/services/:id - Admin update
router.put("/:id", auth, adminOnly, async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json({ message: "Service updated", service });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/services/:id/toggle - Admin activate/deactivate
router.patch("/:id/toggle", auth, adminOnly, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });
    service.isActive = !service.isActive;
    await service.save();
    res.json({ message: `Service ${service.isActive ? "activated" : "deactivated"}`, service });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/services/:id
router.delete("/:id", auth, adminOnly, async (req, res) => {
  try {
    await Service.findByIdAndDelete(req.params.id);
    res.json({ message: "Service deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
