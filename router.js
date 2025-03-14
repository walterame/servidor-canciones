const express = require("express");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

// Ruta para crear una sala nueva
router.post("/crear-sala", (req, res) => {
    // Generamos un código de sala único
    const codigoSala = uuidv4().slice(0, 4).toUpperCase(); // Código de 4 letras

    // Aquí puedes almacenar la sala en la base de datos o memoria si es necesario
    console.log(`Sala creada: ${codigoSala}`);

    res.json({ codigo: codigoSala });
});

// Ruta para otras funcionalidades, como obtener la lista de jugadores, etc.
router.get("/salas", (req, res) => {
    res.json(salas);
});

module.exports = router;