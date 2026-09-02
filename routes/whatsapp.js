const router = require("express").Router();
const WhatsAppDispatch = require("../models/WhatsAppDispatch");
const Booking = require("../models/Booking");
const { auth, adminOnly } = require("../middleware/auth");

// GET /api/whatsapp - List all dispatches (admin)
router.get("/", auth, adminOnly, async (req, res) => {
  try {
    const dispatches = await WhatsAppDispatch.find()
      .populate("bookingId")
      .sort({ createdAt: -1 });
    res.json(dispatches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/whatsapp/dispatch - Create dispatch for a booking
router.post("/dispatch", auth, adminOnly, async (req, res) => {
  try {
    const { bookingId, partnerName, partnerPhone, salonName } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Generate WhatsApp message text
    const msg = [
      `🎋 QURUX Makeover & Academy`,
      ``,
      `📋 Booking: ${booking.bookingId}`,
      ``,
      `👤 Customer: ${booking.customerName}`,
      `📱 Phone: ${booking.customerPhone}`,
      `💄 Service: ${booking.serviceName}`,
      `📅 Date: ${booking.date} at ${booking.timeSlot || "TBD"}`,
      booking.serviceLocation === "HOME"
        ? `📍 Address: ${booking.address}`
        : `🏢 Salon: ${booking.salonName || "QURUX Salon"}`,
      `💳 Payment: ${booking.paymentMethod} — ₹${booking.amount}`,
      ``,
      `Please coordinate with the customer and confirm the service.`,
    ].join("\n");

    const dispatch = await WhatsAppDispatch.create({
      bookingId: booking._id,
      bookingRef: booking.bookingId,
      partnerName: partnerName || "",
      partnerPhone: partnerPhone || "",
      salonName: salonName || "",
      messageText: msg,
      status: "PENDING",
    });

    // Mark booking as dispatched
    booking.whatsappDispatched = true;
    booking.whatsappSentAt = new Date();
    await booking.save();

    res.status(201).json({ message: "Dispatch created", dispatch });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/whatsapp/:id/sent - Mark as sent manually
router.patch("/:id/sent", auth, adminOnly, async (req, res) => {
  try {
    const dispatch = await WhatsAppDispatch.findByIdAndUpdate(
      req.params.id,
      { status: "SENT", sentAt: new Date() },
      { new: true }
    );
    if (!dispatch) return res.status(404).json({ message: "Dispatch not found" });
    res.json({ message: "Marked as sent", dispatch });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/whatsapp/:id/complete - Mark service completed
router.patch("/:id/complete", auth, adminOnly, async (req, res) => {
  try {
    const dispatch = await WhatsAppDispatch.findByIdAndUpdate(
      req.params.id,
      { serviceCompleted: true, serviceCompletedAt: new Date() },
      { new: true }
    );
    if (!dispatch) return res.status(404).json({ message: "Dispatch not found" });
    res.json({ message: "Service marked completed", dispatch });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
