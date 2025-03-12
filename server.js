const express = require("express");
const { Server } = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = app.listen(3000, () => console.log("Servidor en puerto 3000"));
const wss = new Server({ server });

let salas = {}; // { "ABCD": { jugadores: [], juego: ws, mensajesPendientes: [] } }

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
    salas[codigo] = { jugadores: [], juego: null, mensajesPendientes: [] };
    res.json({ codigo });
});

// Seleccionar avatar
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

            const mensaje = { tipo: "avatar-seleccionado", id, avatar };
            if (salas[sala].juego && salas[sala].juego.readyState === 1) {
                console.log(`✅ Enviando mensaje WebSocket a Unity:`, mensaje);
                salas[sala].juego.send(JSON.stringify(mensaje));
            } else {
                console.log("⚠️ No hay conexión de juego activa, guardando mensaje en cola.");
                salas[sala].mensajesPendientes.push(mensaje);
            }

            return res.json({ mensaje: "Avatar seleccionado con éxito" });
        }
    }

    res.status(404).json({ error: "Jugador no encontrado" });
});

// WebSocket: Manejo de conexiones
wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
        console.log("📩 Mensaje recibido (buffer):", msg);
        
        let data;
        try {
            data = JSON.parse(msg.toString()); // Convertir buffer a string antes de parsear
        } catch (error) {
            console.log("❌ Error al parsear mensaje JSON:", error);
            return;
        }

        console.log("📩 Mensaje recibido (parseado):", data);

        if (data.tipo === "unir") { // Jugador se une a una sala
            let { sala, nombre } = data;

            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }

            let playerId = salas[sala].jugadores.length;
            salas[sala].jugadores.push({ id: playerId, ws, nombre, avatar: null });

            // Manejo de desconexión del jugador
            ws.on("close", () => {
                console.log(`❌ Jugador ${playerId} desconectado de la sala ${sala}`);
                salas[sala].jugadores = salas[sala].jugadores.filter(j => j.ws !== ws);
            });

            // Notificar a Unity sobre el nuevo jugador
           if (salas[sala].juego) {
    console.log(`🔔 Intentando notificar a Unity sobre nuevo jugador: ${nombre}, estado WebSocket: ${salas[sala].juego.readyState}`);

    if (salas[sala].juego.readyState === 1) {
        try {
            salas[sala].juego.send(JSON.stringify({ tipo: "nuevo-jugador", id: playerId, nombre }));
            console.log("✅ Mensaje enviado a Unity.");
        } catch (error) {
            console.log("❌ Error enviando mensaje a Unity:", error);
        }
    } else {
        console.log("⚠️ WebSocket de Unity no está en estado abierto.");
    }
}

            ws.send(JSON.stringify({ tipo: "confirmacion-union", id: playerId }));
        } 
        
        else if (data.tipo === "juego") { // Unity se une como juego principal
            let { sala } = data;

            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }

            salas[sala].juego = ws;

            console.log(`🎮 Unity conectado a la sala ${sala}`);

            // Enviar mensajes pendientes
            salas[sala].mensajesPendientes.forEach(mensaje => {
                console.log(`📤 Enviando mensaje pendiente a Unity:`, mensaje);
                ws.send(JSON.stringify(mensaje));
            });
            salas[sala].mensajesPendientes = []; // Limpiar cola de mensajes pendientes

            // Manejo de desconexión de Unity
            ws.on("close", () => {
                console.log(`⚠️ Unity desconectado de la sala ${sala}`);
                salas[sala].juego = null;
            });
        }
    });

    ws.on("close", () => {
        console.log("⚠️ Un WebSocket se ha desconectado.");
    });

    ws.on("error", (err) => {
        console.log(`⚠️ Error en WebSocket: ${err.message}`);
    });
});
