function hostOnly(req, res, next) {
  if (req.userRole !== "host") {
    return res.status(403).json({
      message: "Only hosts can perform this action",
    });
  }

  next();
}

function adminOnly(req, res, next) {
  if (req.userRole !== "admin") {
    return res.status(403).json({
      message: "Only admins can perform this action",
    });
  }

  next();
}

function pilgrimOnly(req, res, next) {
  if (req.userRole !== "pilgrim") {
    return res.status(403).json({
      message: "Only pilgrims can perform this action",
    });
  }

  next();
}

module.exports = hostOnly;
module.exports.hostOnly = hostOnly;
module.exports.adminOnly = adminOnly;
module.exports.pilgrimOnly = pilgrimOnly;
