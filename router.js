const express = require("express");
const router = express.Router();

router.post("/crear-sala", (req, res) => {
    const codigoSala = Math.random().toString(36).substr(2, 4).toUpperCase();
    res.json({ codigo: codigoSala });
});

module.exports = router;