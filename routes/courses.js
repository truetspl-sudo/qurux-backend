const router = require("express").Router();
const Course = require("../models/Course");
const { auth, adminOnly } = require("../middleware/auth");

// GET /api/courses - Public
router.get("/", async (req, res) => {
  try {
    const { level, search } = req.query;
    const filter = { isActive: true };

    if (level && level !== "All") filter.level = level;
    if (search) filter.title = { $regex: search, $options: "i" };

    const courses = await Course.find(filter).sort({ level: 1, title: 1 });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/courses/all - Admin
router.get("/all", auth, adminOnly, async (req, res) => {
  try {
    const courses = await Course.find().sort({ level: 1, title: 1 });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/courses/:slug
router.get("/:slug", async (req, res) => {
  try {
    const course = await Course.findOne({ slug: req.params.slug });
    if (!course) return res.status(404).json({ message: "Course not found" });
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/courses - Admin create
router.post("/", auth, adminOnly, async (req, res) => {
  try {
    const course = await Course.create(req.body);
    res.status(201).json({ message: "Course created", course });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/courses/:id
router.put("/:id", auth, adminOnly, async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!course) return res.status(404).json({ message: "Course not found" });
    res.json({ message: "Course updated", course });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/courses/:id/toggle
router.patch("/:id/toggle", auth, adminOnly, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found" });
    course.isActive = !course.isActive;
    await course.save();
    res.json({ message: `Course ${course.isActive ? "activated" : "deactivated"}`, course });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/courses/:id
router.delete("/:id", auth, adminOnly, async (req, res) => {
  try {
    await Course.findByIdAndDelete(req.params.id);
    res.json({ message: "Course deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
