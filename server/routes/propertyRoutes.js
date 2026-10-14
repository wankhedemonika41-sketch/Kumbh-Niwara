const express = require("express");
const Property = require("../models/Property");
const protect = require("../middleware/authMiddleware");
const hostOnly = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/", protect, hostOnly, async (req, res) => {
  try {
    const {
      title,
      description,
      location,
      pricePerNight,
      maxGuests,
      amenities,
      images,
    } = req.body;

    if (
      !title ||
      !description ||
      !location ||
      !pricePerNight ||
      !maxGuests
    ) {
      return res.status(400).json({
        message: "Please provide all required property details",
      });
    }

    const property = await Property.create({
      hostId: req.userId,
      title,
      description,
      location,
      pricePerNight,
      maxGuests,
      amenities: amenities || [],
      images: images || [],
      status: "pending",
    });

    res.status(201).json({
      message: "Property submitted for admin approval",
      property,
    });
  } catch (error) {
    res.status(500).json({
      message: "Property creation failed",
      error: error.message,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const properties = await Property.find({ status: "approved" })
      .populate("hostId", "name email")
      .sort({ createdAt: -1 });

    res.json({
      count: properties.length,
      properties,
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not fetch properties",
      error: error.message,
    });
  }
});

module.exports = router;
