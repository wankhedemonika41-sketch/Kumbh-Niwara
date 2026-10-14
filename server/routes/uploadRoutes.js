const express = require("express");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const protect = require("../middleware/authMiddleware");
const hostOnly = require("../middleware/roleMiddleware");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function configureCloudinary() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return false;
  cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET });
  return true;
}

router.post("/image", protect, hostOnly, upload.single("image"), async (req, res) => {
  try {
    if (!configureCloudinary()) return res.status(503).json({ message: "Cloudinary keys are not configured on the server" });
    if (!req.file) return res.status(400).json({ message: "Image file is required" });

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: "kumbh-niwara" }, (error, value) => (error ? reject(error) : resolve(value)));
      stream.end(req.file.buffer);
    });

    res.status(201).json({ url: result.secure_url, publicId: result.public_id });
  } catch (error) {
    console.error("Cloudinary upload failed:", error.message);
    res.status(500).json({ message: "Image upload failed", error: error.message });
  }
});

module.exports = router;
