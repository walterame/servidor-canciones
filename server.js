const express = require("express");
const { Server } = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = app.listen(3000, () => console.log("Servidor en puerto 3000"));
const wss = new Server({ server });

let salas = {}; // { "ABCD": { jugadores: [], juego: ws } }

// Función para generar un código único de 4 letras
function generarCodigo() {
    const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let codigo;
    do {
        codigo = Array.from({ length: 4 }, () => letras[Math.floor(Math.random() * letras.length)]).join("");
    } while (salas[codigo]);
    return codigo;
}

// Endpoint para crear una sala
app.post("/crear-sala", (req, res) => {
    let codigo = generarCodigo();
    salas[codigo] = { jugadores: [], juego: null };
    res.json({ codigo });
});

// Nuevo endpoint: Seleccionar avatar
app.post("/seleccionar-avatar", (req, res) => {
    const { id, avatar } = req.body;
    
    if (!id || !avatar) {
        return res.status(400).json({ error: "ID de jugador y avatar son requeridos" });
    }

    // Buscar la sala del jugador
    for (let sala in salas) {
        let jugador = salas[sala].jugadores.find(j => j.id == id);
        if (jugador) {
            jugador.avatar = avatar;

            // Enviar actualización a Unity
            if (salas[sala].juego) {
                salas[sala].juego.send(JSON.stringify({ tipo: "avatar-seleccionado", id, avatar }));
            }

            return res.json({ mensaje: "Avatar seleccionado con éxito" });
        }
    }

    res.status(404).json({ error: "Jugador no encontrado" });
});

// WebSocket: Manejo de conexiones
wss.on("connection", (ws, req) => {
    ws.on("message", (msg) => {
        console.log("Mensaje recibido:", msg);
        let data = JSON.parse(msg);
        
        if (data.tipo === "unir") { // Jugador se une a una sala
            let { sala, nombre } = data;

            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }

            let playerId = salas[sala].jugadores.length; // ID secuencial
            salas[sala].jugadores.push({ id: playerId, ws, nombre, avatar: null });

            // Notificar a Unity sobre el nuevo jugador
            if (salas[sala].juego) {
                salas[sala].juego.send(JSON.stringify({ tipo: "nuevo-jugador", id: playerId, nombre }));
            }
            // Enviar la respuesta con el id del jugador para la redirección
            ws.send(JSON.stringify({ tipo: "confirmacion-union", id: playerId }));
        } 
        
        else if (data.tipo === "juego") { // Unity se une como juego principal
            let { sala } = data;
            if (salas[sala]) {
                salas[sala].juego = ws;
            }
        }
    });
});
