const router = require("express").Router();
const Booking = require("../models/Booking");
const Salon = require("../models/Salon");
const { auth, adminOnly, approvedCustomer } = require("../middleware/auth");
const { syncEMIPlanFromPayment } = require("../utils/emiSync");

// Generate booking ID
function genBookingId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `BK-${y}${m}-${rand}`;
}

// POST /api/bookings - Create booking
router.post("/", auth, approvedCustomer, async (req, res) => {
  try {
    const {
      serviceName, serviceCategory, serviceLocation, address, city, pincode,
      salonId, salonName, date, timeSlot, amount, paymentMethod,
      bobPaidAmount, cashAmount, emiAmount,
    } = req.body;

    if (!serviceName || !serviceLocation || !date || !amount) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Home service minimum ₹2,500 check
    if (serviceLocation === "HOME" && amount < 2500) {
      return res.status(400).json({
        message: "Home service requires minimum cart of ₹2,500",
        meetsMin: false,
      });
    }

    // BOB FIFO deduction
    let bobPaid = 0;
    if (paymentMethod === "BOB" || paymentMethod === "MIXED") {
      bobPaid = Math.min(bobPaidAmount || 0, amount);
    }

    const booking = await Booking.create({
      bookingId: genBookingId(),
      customerId: req.user._id,
      serviceName,
      serviceCategory: serviceCategory || "",
      serviceLocation,
      address: address || "",
      city: city || "",
      pincode: pincode || "",
      salonId: salonId || undefined,
      salonName: salonName || "",
      date,
      timeSlot: timeSlot || "",
      customerName: req.user.fullName,
      customerPhone: req.user.mobile,
      customerEmail: req.user.email,
      amount,
      listedPrice: amount,
      paymentMethod: paymentMethod || "FULL",
      bobPaidAmount: bobPaid,
      cashAmount: cashAmount || 0,
      emiAmount: emiAmount || 0,
      // Manual model (no payment gateway): booking ke waqt koi payment nahi.
      // FULL / EMI / BOB sab PENDING start hote hain — admin service close
      // karte waqt payment update karta hai (mode + amount manually).
      paymentStatus: "PENDING",
      meetsMinAmount: serviceLocation !== "HOME" || amount >= 2500,
    });

    res.status(201).json({ message: "Booking created", booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/bookings - My bookings (customer) or all (admin)
router.get("/", auth, async (req, res) => {
  try {
    let filter;
    if (req.user.role === "ADMIN") {
      filter = {};
    } else if (req.user.role === "SALON_OWNER") {
      // Partner salon: sirf us salon ki bookings dikhengi — doosre salon ki nahi
      const salon = await Salon.findOne({ userId: req.user._id });
      filter = salon ? { salonId: salon._id } : { salonId: null };
    } else {
      filter = { customerId: req.user._id };
    }

    const bookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .populate("customerId", "fullName mobile email")
      .populate("salonId", "name city");

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/bookings/:id
router.get("/:id", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("customerId", "fullName mobile email")
      .populate("salonId", "name city address");
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/bookings/:id/status - Admin update status
router.patch("/:id/status", auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    // Find by _id or bookingId string
    let booking = null;
    try { booking = await Booking.findById(req.params.id); } catch {}
    if (!booking) booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.status = status;
    await booking.save();

    res.json({ message: "Status updated", booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/bookings/:id/start - Partner starts the service (IN_PROGRESS + startedAt)
router.patch('/:id/start', auth, async (req, res) => {
  try {
    let booking = null;
    try { booking = await Booking.findById(req.params.id); } catch {}
    if (!booking) booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED' || booking.status === 'PARTNER_COMPLETED') {
      return res.status(400).json({ message: 'Is booking pe abhi start action nahi ho sakta.' });
    }
    if (booking.status === 'IN_PROGRESS') {
      return res.status(400).json({ message: 'Service pehle se start ho chuki hai.' });
    }

    if (req.user.role === 'SALON_OWNER') {
      const salon = await Salon.findOne({ userId: req.user._id });
      if (!salon || !booking.salonId || String(booking.salonId) !== String(salon._id)) {
        return res.status(403).json({ message: 'Ye booking aapke salon ki nahi hai.' });
      }
    } else if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Sirf partner salon ya admin ye action kar sakta hai.' });
    }

    booking.status = 'IN_PROGRESS';
    booking.startedAt = new Date();
    await booking.save();

    res.json({ message: 'Service start ho gayi — IN_PROGRESS.', booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/bookings/:id/partner-complete - Partner salon marks service DONE
// (booking status PARTNER_COMPLETED → admin closure page pe "awaiting verification" dikhti hai)
router.patch("/:id/partner-complete", auth, async (req, res) => {
  try {
    let booking = null;
    try { booking = await Booking.findById(req.params.id); } catch {}
    if (!booking) booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.status === "COMPLETED" || booking.status === "CANCELLED") {
      return res.status(400).json({ message: "Ye booking already close/cancel ho chuki hai." });
    }
    if (booking.status === "PARTNER_COMPLETED") {
      return res.status(400).json({ message: "Service pehle se completed mark hai — admin verification ka intezaar hai." });
    }

    if (req.user.role === "SALON_OWNER") {
      // Partner sirf APNI salon ki booking mark kar sakta hai (isolation rule)
      const salon = await Salon.findOne({ userId: req.user._id });
      if (!salon || !booking.salonId || String(booking.salonId) !== String(salon._id)) {
        return res.status(403).json({ message: "Ye booking aapke salon ki nahi hai." });
      }
    } else if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Sirf partner salon ya admin ye action kar sakta hai." });
    }

    booking.status = "PARTNER_COMPLETED";
    booking.partnerCompletedAt = new Date();
    await booking.save();

    res.json({ message: "Service completed mark kar di — admin verification pending.", booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/bookings/:id/pay - Mark paid (after Payment approved manually)
router.patch("/:id/pay", auth, adminOnly, async (req, res) => {
  try {
    let booking = null;
    try { booking = await Booking.findById(req.params.id); } catch {}
    if (!booking) booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.paymentStatus = "PAID";
    await booking.save();
    res.json({ message: "Booking marked PAID", booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/bookings/:id/close - Admin closure (payment reconciliation only)
// RULES:
//  • Admin close ke waqt rating/review NAHI deta — sirf payment update.
//  • Final price: booking.amount (listed) default; admin closure pe finalPrice
//    de sakta hai agar service ke baad price change hua (listing vs final).
// PATCH /api/bookings/:id/reopen - Admin reopens a closed booking for payment edit
router.patch("/:id/reopen", auth, adminOnly, async (req, res) => {
  try {
    let booking = null;
    try { booking = await Booking.findById(req.params.id); } catch {}
    if (!booking) booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.status !== "COMPLETED") {
      return res.status(400).json({ message: "Sirf closed bookings reopen ho sakte hain." });
    }
    booking.status = "ADMIN_VERIFIED";
    booking.closedAt = undefined;
    await booking.save();
    res.json({ message: "Booking reopened for payment edit.", booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

//  • BOB wallet settlement: walletAmount closure pe customer ke BOB wallet se
//    FIFO deduct hota hai + walletTransactionId record hota hai.
//  • EMI 25/75: EMI remainder pe minimum 25% abhi; baaki EMI plan.
//  • Overpay / negative due allowed nahi — totalPaid ≤ finalPrice.
router.patch("/:id/close", auth, adminOnly, async (req, res) => {
  try {
    const { adminRemarks, paymentStatus, cashAmount, paidVia, finalPrice, walletAmount, paymentCollectionMethod, vendorDirectAmount, gstSlab } = req.body;
    // Find by _id or bookingId string
    let booking = null;
    try { booking = await Booking.findById(req.params.id); } catch {}
    if (!booking) booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.status === "COMPLETED") {
      return res.status(400).json({ message: "Booking pehle se CLOSED hai — duplicate closure allowed nahi." });
    }
    if (booking.status === "CANCELLED") {
      return res.status(400).json({ message: "Cancelled booking close nahi kar sakte." });
    }

    const listed = Math.max(0, Number(booking.listedPrice || booking.amount || 0));
    const bill =
      finalPrice !== undefined && finalPrice !== null && finalPrice !== ""
        ? Math.max(0, Number(finalPrice) || 0)
        : Math.max(0, Number(booking.finalPrice || booking.amount || 0));
    if (bill <= 0) return res.status(400).json({ message: "Final price ₹0 se badi honi chahiye." });
    // Sanity: final price listed price se 2x se zyada nahi hona chahiye (admin typo guard)
    if (listed > 0 && bill > listed * 2) {
      return res.status(400).json({
        message: `Final price ₹${bill.toLocaleString("en-IN")} listed price ₹${listed.toLocaleString("en-IN")} se 2x se zyada hai — please check.`,
      });
    }

    const emiPath = paidVia === "EMI" || booking.paymentMethod === "EMI" || booking.paymentMethod === "MIXED";
    const collectedInput = Math.max(0, Number(cashAmount) || 0);
    // Wallet use final price se zyada nahi ho sakta (zyda bheja to bill tak hi kate)
    const walletInput = Math.min(bill, Math.max(0, Number(walletAmount) || 0));
    const existingBob = Math.min(bill, Math.max(0, Number(booking.bobPaidAmount) || 0));
    const bobTotal = Math.min(bill, existingBob + walletInput);
    const cashPlanned = Math.min(bill - bobTotal, collectedInput);
    const totalPaid = bobTotal + cashPlanned;

    // Validation (wallet deduct se PEHLE — taki fail hone par wallet na kat sake)
    if (totalPaid > bill) {
      return res.status(400).json({ message: "Total payment final price se zyada nahi ho sakta." });
    }
    if (paymentStatus === "PAID" && totalPaid < bill) {
      return res.status(400).json({
        message: `PAID mark karne ke liye pura amount chahiye (₹${bill.toLocaleString("en-IN")}). Abhi total ₹${totalPaid.toLocaleString("en-IN")} — balance bacha hai.`,
      });
    }
    const emiRemainder = Math.max(0, bill - bobTotal);
    let pending = 0;
    if (emiPath && emiRemainder > 0) {
      const minDown = Math.ceil(emiRemainder * 0.25);
      if (cashPlanned < minDown) {
        return res.status(400).json({
          message: `EMI option pe minimum 25% (₹${minDown}) abhi pay karna hoga (EMI remainder ₹${emiRemainder.toLocaleString("en-IN")} pe) — baaki EMI balance banega.`,
        });
      }
    }

    // ── BOB wallet settlement (deduction + transaction record) ──
    if (walletInput > 0) {
      if (booking.walletTransactionId) {
        return res.status(400).json({ message: "Is booking pe BOB wallet settlement pehle se record ho chuka hai." });
      }
      const { deductWalletFIFO } = require("../utils/walletUse");
      const result = await deductWalletFIFO(
        booking.customerId,
        walletInput,
        `Service payment — ${booking.serviceName || "Qurux Service"} (${booking.bookingId})`
      );
      if (!result.ok) return res.status(400).json({ message: result.error });
      booking.walletTransactionId = result.txId;
    }

    booking.listedPrice = booking.listedPrice || listed;
    booking.finalPrice = bill;
    booking.status = "COMPLETED";
    booking.closedAt = new Date();
    booking.adminRemarks = adminRemarks || "";
    booking.paidVia = paidVia && ["CASH", "UPI", "BOB", "EMI"].includes(paidVia) ? paidVia : booking.paidVia;
    booking.paymentStatus =
      paymentStatus && ["PAID", "PENDING", "PARTIAL", "REFUNDED"].includes(paymentStatus)
        ? paymentStatus
        : "PAID";
    booking.bobPaidAmount = bobTotal;
    booking.cashAmount = cashPlanned;

    if (emiPath) {
      // EMI plan: wallet/BOB part settle ho chuka — EMI sirf remainder pe
      const plan = await syncEMIPlanFromPayment({
        refType: "booking",
        doc: booking,
        purchaseType: "SERVICE",
        purchaseName: booking.serviceName || "Qurux Service",
        collectedAmount: booking.cashAmount,
        totalOverride: emiRemainder,
        bobOverride: 0,
      });
      pending = plan.pending;
      booking.emiAmount = pending;
      booking.paymentStatus = pending > 0 ? "PARTIAL" : "PAID";
    } else {
      booking.emiAmount = 0;
    }

    // ── Vendor Payout Calculation (Tax-Inclusive) ──
    // Final price is tax-inclusive: base = price / (1 + gstRate/100)
    const gstRate = [0, 5, 12, 18, 28].includes(Number(gstSlab)) ? Number(gstSlab) : 18;
    const divisor = 1 + gstRate / 100;
    const basePrice = Math.round(bill / divisor * 100) / 100;
    const gstAmount = Math.round((bill - basePrice) * 100) / 100;
    const cgst = Math.round(gstAmount / 2 * 100) / 100;
    const sgst = Math.round((gstAmount - cgst) * 100) / 100;
    // Commission: 10% of final price (tax-inclusive)
    const platformCommission = Math.round(bill * 0.10);
    const vendorGross = bill - platformCommission;
    // Direct payment to vendor deduction
    const vendorDirect = Math.max(0, Number(vendorDirectAmount) || 0);
    const vendorNet = Math.max(0, vendorGross - vendorDirect);
    // Collection method
    const collectionMethod = paymentCollectionMethod || "COMPANY";
    let companyCollected = bill - vendorDirect;
    if (collectionMethod === "COMPANY") companyCollected = bill;
    if (collectionMethod === "VENDOR_DIRECT") companyCollected = 0;

    // Update booking with vendor payout fields
    booking.paymentCollectionMethod = collectionMethod;
    booking.vendorDirectAmount = vendorDirect;
    booking.companyCollectedAmount = Math.max(0, companyCollected);
    booking.gstSlab = gstRate;
    booking.basePrice = basePrice;
    booking.gstAmount = gstAmount;
    booking.cgst = cgst;
    booking.sgst = sgst;
    booking.platformCommission = platformCommission;
    booking.vendorGrossPayout = vendorGross;
    booking.vendorNetPayout = vendorNet;

    await booking.save();

    // ── Auto-create Payout record with full financials ──
    if (booking.salonId) {
      try {
        const Payout = require("../models/Payout");
        const existingPayout = await Payout.findOne({ bookingId: booking._id });
        if (!existingPayout) {
          await Payout.create({
            salonId: booking.salonId,
            salonName: booking.salonName || "",
            bookingId: booking._id,
            bookingCode: booking.bookingId,
            customerId: booking.customerId,
            customerName: booking.customerName || "",
            serviceName: booking.serviceName || "",
            listedPrice: listed,
            finalPrice: bill,
            paymentCollectionMethod: collectionMethod,
            companyCollectedAmount: Math.max(0, companyCollected),
            vendorDirectAmount: vendorDirect,
            bobWalletUsed: bobTotal,
            emiPending: pending || 0,
            gstSlab: gstRate,
            basePrice,
            gstAmount,
            cgst,
            sgst,
            commissionRate: 10,
            platformCommission,
            vendorGrossPayout: vendorGross,
            vendorNetPayout: vendorNet,
            status: "PENDING",
            closedAt: new Date(),
          });
        }
      } catch (payoutErr) {
        console.error("[PAYOUT AUTO-CREATE FAIL]", payoutErr.message);
      }
    }

    const dueAmount = Math.max(0, bill - totalPaid);
    res.json({
      message: "Booking closed",
      booking,
      settlement: {
        listedPrice: listed,
        finalPrice: bill,
        gstSlab: gstRate,
        basePrice,
        gstAmount,
        cgst,
        sgst,
        platformCommission,
        vendorGrossPayout: vendorGross,
        vendorNetPayout: vendorNet,
        vendorDirectAmount: vendorDirect,
        companyCollected: Math.max(0, companyCollected),
        bobWalletUsed: bobTotal,
        cashCollected: booking.cashAmount,
        totalPaid,
        dueAmount,
        emiPending: emiPath ? pending : 0,
        paymentStatus: booking.paymentStatus,
        paymentCollectionMethod: collectionMethod,
        walletTransactionId: booking.walletTransactionId,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/bookings/:id/invoice — Generate invoice data for PDF ──
router.get("/:id/invoice", auth, async (req, res) => {
  try {
    let booking = null;
    try { booking = await Booking.findById(req.params.id); } catch {}
    if (!booking) booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.status !== "COMPLETED") {
      return res.status(400).json({ message: "Invoice sirf closed bookings ke liye available hai." });
    }

    const bill = booking.finalPrice || booking.amount || 0;
    const gstSlab = booking.gstSlab || 18;
    const basePrice = booking.basePrice || Math.round(bill / (1 + gstSlab / 100) * 100) / 100;
    const gstAmount = booking.gstAmount || Math.round((bill - basePrice) * 100) / 100;
    const cgst = booking.cgst || Math.round(gstAmount / 2 * 100) / 100;
    const sgst = booking.sgst || Math.round((gstAmount - cgst) * 100) / 100;
    const commission = booking.platformCommission || Math.round(bill * 0.10);
    const vendorGross = bill - commission;
    const vendorDirect = booking.vendorDirectAmount || 0;
    const vendorNet = Math.max(0, vendorGross - vendorDirect);
    const totalUpfront = (booking.bobPaidAmount || 0) + (booking.cashAmount || 0);
    const emiBalance = Math.max(0, bill - totalUpfront);

    const invoice = {
      invoiceNumber: `INV-${booking.bookingId}`,
      invoiceDate: booking.closedAt || new Date(),
      bookingId: booking.bookingId,
      // Customer
      customer: {
        name: booking.customerName,
        phone: booking.customerPhone,
        email: booking.customerEmail || "",
      },
      // Service
      service: {
        name: booking.serviceName,
        category: booking.serviceCategory || "",
        date: booking.date,
        timeSlot: booking.timeSlot,
        location: booking.serviceLocation === "HOME" ? booking.address : (booking.salonName || "Salon"),
      },
      // Financial
      financial: {
        basePrice,
        gstSlab,
        gstAmount,
        cgst,
        sgst,
        totalBilled: bill,
      },
      // Payments
      payments: {
        bobWalletUsed: booking.bobPaidAmount || 0,
        cashCollected: booking.cashAmount || 0,
        totalUpfront,
        emiBalance,
        paymentStatus: booking.paymentStatus,
        paidVia: booking.paidVia || "",
      },
      // EMI Terms (if applicable)
      emiTerms: emiBalance > 0 ? {
        tenureMonths: 6,
        interestRate: 0,
        lateFeePerDay: 10,
        lateFeeStartDay: 180,
        conditions: [
          "Maximum 6 months repayment window.",
          "No fixed monthly instalment — pay any amount, anytime.",
          "Zero interest during 6-month window.",
          "After 6 months: ₹10/day late fee until fully cleared.",
        ],
      } : null,
      // Vendor
      vendor: booking.salonName ? {
        salonName: booking.salonName,
        grossPayout: vendorGross,
        directCollected: vendorDirect,
        netPayout: vendorNet,
      } : null,
      // Company
      company: {
        name: "QURUX Makeover & Academy",
        gst: "",
        phone: "+91 9911227916",
      },
    };

    res.json({ data: invoice });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
