const express = require("express");
const { Server } = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = app.listen(3000, () => console.log("Servidor en puerto 3000"));
const wss = new Server({ server });

let salas = {}; // Almacena las salas { "ABCD": { jugadores: [], juego: ws } }

// Función para generar un código único de 4 letras
function generarCodigo() {
    let codigo;
    do {
        codigo = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (salas[codigo]);
    return codigo;
}

// Endpoint para crear una sala y enviar el código a Unity
app.post("/crear-sala", (req, res) => {
    let codigo = generarCodigo();
    salas[codigo] = { jugadores: [], juego: null };
    res.json({ codigo }); // Enviar código a Unity
});

// WebSocket: Manejo de conexiones
wss.on("connection", (ws, req) => {
    ws.on("message", (msg) => {
        console.log("Mensaje recibido:", msg);  // Imprimir el mensaje recibido en el servidor
        let data = JSON.parse(msg);
        
        if (data.tipo === "unir") { // Jugador se une a una sala
            let { sala, nombre } = data;
            console.log("Jugador se une a la sala:", sala, nombre); // Verificar cuando un jugador se une

            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }
            salas[sala].jugadores.push({ ws, nombre });
        } 
        
        else if (data.tipo === "juego") { // Unity se une como juego principal
            let { sala } = data;
            if (salas[sala]) {
                salas[sala].juego = ws;
            }
        }
    });
});
