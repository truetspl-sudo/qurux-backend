const router = require("express").Router();
const Product = require("../models/Product");
const { auth, adminOnly } = require("../middleware/auth");

// GET /api/products - Public listing
router.get("/", async (req, res) => {
  try {
    const { category, search } = req.query;
    const filter = { isActive: true };

    if (category && category !== "All") filter.category = category;
    if (search) filter.name = { $regex: search, $options: "i" };

    const products = await Product.find(filter).sort({ category: 1, name: 1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/products/all - Admin
router.get("/all", auth, adminOnly, async (req, res) => {
  try {
    const products = await Product.find().sort({ category: 1, name: 1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/products/:slug
router.get("/:slug", async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/products - Admin create
router.post("/", auth, adminOnly, async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json({ message: "Product created", product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/products/:id
router.put("/:id", auth, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product updated", product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/products/:id/toggle
router.patch("/:id/toggle", auth, adminOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    product.isActive = !product.isActive;
    await product.save();
    res.json({ message: `Product ${product.isActive ? "activated" : "deactivated"}`, product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/products/:id/stock - Admin inline stock update
router.patch("/:id/stock", auth, adminOnly, async (req, res) => {
  try {
    const { change } = req.body; // +1 or -1
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    product.stock = Math.max(0, product.stock + (change || 0));
    await product.save();
    res.json({ message: "Stock updated", stock: product.stock });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/products/:id
router.delete("/:id", auth, adminOnly, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
