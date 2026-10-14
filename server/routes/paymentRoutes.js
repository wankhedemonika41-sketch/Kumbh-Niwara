const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const protect = require("../middleware/authMiddleware");
const { pilgrimOnly } = require("../middleware/roleMiddleware");

const router = express.Router();

function razorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

router.post("/create-order", protect, pilgrimOnly, async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking id" });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      pilgrimId: req.userId,
      status: "pending_payment",
    });

    if (!booking) {
      return res.status(404).json({ message: "Pending booking not found" });
    }

    const client = razorpayClient();
    if (!client) {
      return res.status(503).json({
        message: "Razorpay keys are not configured on the server",
      });
    }

    const order = await client.orders.create({
      amount: Math.round(booking.totalAmount * 100),
      currency: "INR",
      receipt: `booking_${booking._id}`,
    });

    await Payment.findOneAndUpdate(
      { bookingId: booking._id },
      {
        bookingId: booking._id,
        razorpayOrderId: order.id,
        amount: booking.totalAmount,
        status: "created",
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    res.status(500).json({ message: "Could not create payment order", error: error.message });
  }
});

router.post("/verify", protect, pilgrimOnly, async (req, res) => {
  try {
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!bookingId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Payment verification fields are required" });
    }

    const booking = await Booking.findOne({ _id: bookingId, pilgrimId: req.userId, status: "pending_payment" });
    const payment = await Payment.findOne({ bookingId, razorpayOrderId: razorpay_order_id });
    if (!booking || !payment) return res.status(404).json({ message: "Payment record not found" });

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await Payment.findByIdAndUpdate(payment._id, { status: "failed" });
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    const overlappingBooking = await Booking.findOne({
      _id: { $ne: booking._id },
      propertyId: booking.propertyId,
      status: { $in: ["pending_payment", "confirmed"] },
      checkIn: { $lt: booking.checkOut },
      checkOut: { $gt: booking.checkIn },
    });

    if (overlappingBooking) {
      await Payment.findByIdAndUpdate(payment._id, { status: "failed" });
      await Booking.findByIdAndUpdate(booking._id, { status: "payment_failed" });
      return res.status(409).json({ message: "Dates were booked by another pilgrim" });
    }

    await Payment.findByIdAndUpdate(payment._id, {
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      status: "verified",
    });
    const confirmedBooking = await Booking.findByIdAndUpdate(
      booking._id,
      { status: "confirmed", paymentId: razorpay_payment_id },
      { new: true }
    );

    res.json({ message: "Payment verified and booking confirmed", booking: confirmedBooking });
  } catch (error) {
    res.status(500).json({ message: "Payment verification failed", error: error.message });
  }
});

module.exports = router;
