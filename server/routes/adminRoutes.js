const express = require("express");
const mongoose = require("mongoose");
const Property = require("../models/Property");
const protect = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/properties/pending", protect, adminOnly, async (req, res) => {
  try {
    const properties = await Property.find({ status: "pending" })
      .populate("hostId", "name email")
      .sort({ createdAt: -1 });

    res.json({
      count: properties.length,
      properties,
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not fetch pending properties",
      error: error.message,
    });
  }
});

async function updatePropertyStatus(req, res, status) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid property id",
      });
    }

    const property = await Property.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!property) {
      return res.status(404).json({
        message: "Property not found",
      });
    }

    res.json({
      message: `Property ${status} successfully`,
      property,
    });
  } catch (error) {
    res.status(500).json({
      message: `Property ${status} failed`,
      error: error.message,
    });
  }
}

router.patch(
  "/properties/:id/approve",
  protect,
  adminOnly,
  (req, res) => updatePropertyStatus(req, res, "approved")
);

router.patch(
  "/properties/:id/reject",
  protect,
  adminOnly,
  (req, res) => updatePropertyStatus(req, res, "rejected")
);

module.exports = router;
