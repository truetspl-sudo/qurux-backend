const router = require("express").Router();
const Order = require("../models/Order");
const Product = require("../models/Product");
const { auth, adminOnly, approvedCustomer } = require("../middleware/auth");

function genOrderId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `ORD-${y}${m}-${rand}`;
}

// POST /api/orders - Create order
router.post("/", auth, approvedCustomer, async (req, res) => {
  try {
    const { items, deliveryAddress, city, pincode, paymentMethod, bobPaidAmount, cashAmount } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ message: "At least one item required" });
    }

    // Calculate subtotal from DB prices
    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
      // Product can be referenced by Mongo _id or by catalog slug (e.g. essn-glow-serum)
      let product = null;
      try {
        product = await Product.findById(item.productId);
      } catch { /* not a valid ObjectId — try slug */ }
      if (!product) product = await Product.findOne({ slug: item.productId });
      if (!product) return res.status(400).json({ message: `Product not found: ${item.productId}` });
      if (product.stock < (item.quantity || 1)) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }
      const qty = item.quantity || 1;
      subtotal += product.price * qty;
      orderItems.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: qty,
        image: product.image,
      });
      // Deduct stock
      product.stock -= qty;
      await product.save();
    }

    const order = await Order.create({
      orderId: genOrderId(),
      customerId: req.user._id,
      items: orderItems,
      subtotal,
      shipping: 0,
      total: subtotal,
      deliveryAddress: deliveryAddress || "",
      city: city || "",
      pincode: pincode || "",
      paymentMethod: paymentMethod || "FULL",
      bobPaidAmount: bobPaidAmount || 0,
      cashAmount: cashAmount || 0,
      // Manual payment model: NO auto-PAID. Customer pays via UPI, admin
      // verifies & approves the Payment record — only then is it PAID.
      paymentStatus: paymentMethod === "BOB" ? "PAID" : "PENDING",
      customerName: req.user.fullName,
      customerPhone: req.user.mobile,
    });

    res.status(201).json({ message: "Order placed", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/orders/:id/pay - Mark paid (after Payment approved manually)
router.patch("/:id/pay", auth, adminOnly, async (req, res) => {
  try {
    let order = null;
    try { order = await Order.findById(req.params.id); } catch {}
    if (!order) order = await Order.findOne({ orderId: req.params.id });
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.paymentStatus = "PAID";
    await order.save();
    res.json({ message: "Order marked PAID", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/orders - My orders (customer) or all (admin)
router.get("/", auth, async (req, res) => {
  try {
    const filter = req.user.role === "ADMIN" ? {} : { customerId: req.user._id };
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/orders/:id
router.get("/:id", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/orders/:id/status - Admin
router.patch("/:id/status", auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json({ message: "Order updated", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
