const express = require("express");

// Instanciamos el router de Express
const router = express.Router();

// Salas y jugadores (debe ser compartido con el server.js)
const salas = {};

// Función para generar un código de sala de 4 letras mayúsculas
function generarCodigoSala() {
    const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let codigo = "";
    for (let i = 0; i < 4; i++) {
        codigo += letras.charAt(Math.floor(Math.random() * letras.length));
    }
    return codigo;
}

// Ruta para crear una sala nueva
router.post("/crear-sala", (req, res) => {
    const codigoSala = generarCodigoSala(); // Generar código con solo letras

    salas[codigoSala] = [];

    console.log(`Sala creada: ${codigoSala}`);

    res.json({ codigo: codigoSala });
});

// Ruta para obtener la lista de salas
router.get("/salas", (req, res) => {
    res.json(salas);
});

// Ruta para obtener la lista de jugadores de una sala específica
router.get("/sala/:codigo", (req, res) => {
    const codigoSala = req.params.codigo;
    const jugadores = salas[codigoSala] || [];
    res.json(jugadores);
});

// Ruta para eliminar una sala
router.delete("/sala/:codigo", (req, res) => {
    const codigoSala = req.params.codigo;
    if (salas[codigoSala]) {
        delete salas[codigoSala];
        console.log(`Sala eliminada: ${codigoSala}`);
        res.status(200).send({ mensaje: "Sala eliminada exitosamente" });
    } else {
        res.status(404).send({ mensaje: "Sala no encontrada" });
    }
});

module.exports = router;
