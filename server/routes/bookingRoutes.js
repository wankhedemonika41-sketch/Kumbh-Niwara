const express = require("express");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const protect = require("../middleware/authMiddleware");
const { pilgrimOnly, hostOnly } = require("../middleware/roleMiddleware");

const router = express.Router();
const activeStatuses = ["pending_payment", "confirmed"];

function getDateRange(checkIn, checkOut) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);

  if (
    !checkIn ||
    !checkOut ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start >= end
  ) {
    return null;
  }

  return { start, end };
}

function getNights(start, end) {
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
}

async function findOverlappingBooking(propertyId, start, end) {
  return Booking.findOne({
    propertyId,
    status: { $in: activeStatuses },
    checkIn: { $lt: end },
    checkOut: { $gt: start },
  });
}

router.post("/check-availability", async (req, res) => {
  try {
    const { propertyId, checkIn, checkOut, guests } = req.body;

    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ message: "Invalid property id" });
    }

    const dates = getDateRange(checkIn, checkOut);
    if (!dates) {
      return res.status(400).json({
        message: "checkIn must be before checkOut and both must be valid dates",
      });
    }

    const property = await Property.findOne({
      _id: propertyId,
      status: "approved",
    });

    if (!property) {
      return res.status(404).json({ message: "Approved property not found" });
    }

    if (!Number.isInteger(guests) || guests < 1 || guests > property.maxGuests) {
      return res.status(400).json({
        message: `Guests must be between 1 and ${property.maxGuests}`,
      });
    }

    const overlappingBooking = await findOverlappingBooking(
      propertyId,
      dates.start,
      dates.end
    );

    const nights = getNights(dates.start, dates.end);

    res.json({
      available: !overlappingBooking,
      nights,
      totalAmount: nights * property.pricePerNight,
      message: overlappingBooking
        ? "Property is not available for these dates"
        : "Property is available",
    });
  } catch (error) {
    res.status(500).json({
      message: "Availability check failed",
      error: error.message,
    });
  }
});

router.post("/create", protect, pilgrimOnly, async (req, res) => {
  try {
    const { propertyId, checkIn, checkOut, guests } = req.body;

    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ message: "Invalid property id" });
    }

    const dates = getDateRange(checkIn, checkOut);
    if (!dates) {
      return res.status(400).json({
        message: "checkIn must be before checkOut and both must be valid dates",
      });
    }

    const property = await Property.findOne({
      _id: propertyId,
      status: "approved",
    });

    if (!property) {
      return res.status(404).json({ message: "Approved property not found" });
    }

    if (!Number.isInteger(guests) || guests < 1 || guests > property.maxGuests) {
      return res.status(400).json({
        message: `Guests must be between 1 and ${property.maxGuests}`,
      });
    }

    const overlappingBooking = await findOverlappingBooking(
      propertyId,
      dates.start,
      dates.end
    );

    if (overlappingBooking) {
      return res.status(409).json({
        message: "Property is already booked for these dates",
      });
    }

    const nights = getNights(dates.start, dates.end);
    const booking = await Booking.create({
      propertyId,
      pilgrimId: req.userId,
      hostId: property.hostId,
      checkIn: dates.start,
      checkOut: dates.end,
      guests,
      totalAmount: nights * property.pricePerNight,
      status: "pending_payment",
    });

    res.status(201).json({
      message: "Booking created and waiting for payment",
      booking,
    });
  } catch (error) {
    res.status(500).json({
      message: "Booking creation failed",
      error: error.message,
    });
  }
});

router.get("/my-bookings", protect, pilgrimOnly, async (req, res) => {
  try {
    const bookings = await Booking.find({ pilgrimId: req.userId })
      .populate("propertyId", "title location pricePerNight images")
      .populate("hostId", "name email")
      .sort({ createdAt: -1 });

    res.json({ count: bookings.length, bookings });
  } catch (error) {
    res.status(500).json({
      message: "Could not fetch your bookings",
      error: error.message,
    });
  }
});

router.get("/host-bookings", protect, hostOnly, async (req, res) => {
  try {
    const bookings = await Booking.find({ hostId: req.userId })
      .populate("propertyId", "title location")
      .populate("pilgrimId", "name email")
      .sort({ checkIn: 1 });

    res.json({ count: bookings.length, bookings });
  } catch (error) {
    res.status(500).json({
      message: "Could not fetch host bookings",
      error: error.message,
    });
  }
});

module.exports = router;
