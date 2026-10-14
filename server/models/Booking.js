const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },

    pilgrimId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    checkIn: {
      type: Date,
      required: true,
    },

    checkOut: {
      type: Date,
      required: true,
    },

    guests: {
      type: Number,
      required: true,
      min: 1,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 1,
    },

    status: {
      type: String,
      enum: [
        "pending_payment",
        "confirmed",
        "payment_failed",
        "cancelled",
      ],
      default: "pending_payment",
    },

    paymentId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

bookingSchema.index({ propertyId: 1, checkIn: 1, checkOut: 1, status: 1 });
bookingSchema.index({ pilgrimId: 1, createdAt: -1 });
bookingSchema.index({ hostId: 1, createdAt: -1 });

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
