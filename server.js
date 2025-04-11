import express from "express";
import { WebSocketServer as Server } from "ws";
import cors from "cors";
import { createServer } from "http";

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
server.listen(3000, () => console.log("Servidor en puerto 3000"));

const wss = new Server({ server });

let salas = {}; // { "ABCD": { jugadores: [], juego: ws, mensajesPendientes: [] } }

function generarCodigo() {
    const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let codigo;
    do {
        codigo = Array.from({ length: 4 }, () => letras[Math.floor(Math.random() * letras.length)]).join("");
    } while (salas[codigo]);
    return codigo;
}

app.post("/crear-sala", (req, res) => {
    let codigo = generarCodigo();
    salas[codigo] = { jugadores: [], juego: null, mensajesPendientes: [] };
    res.json({ codigo });
});

app.post("/seleccionar-avatar", (req, res) => {
    const { id, avatar } = req.body;
    if (!id || !avatar) return res.status(400).json({ error: "ID de jugador y avatar son requeridos" });
    for (let sala in salas) {
        let jugador = salas[sala].jugadores.find(j => j.id == id);
        if (jugador) {
            jugador.avatar = avatar;
            const mensaje = { tipo: "avatar-seleccionado", id, avatar };
            if (salas[sala].juego && salas[sala].juego.readyState === 1) {
                salas[sala].juego.send(JSON.stringify(mensaje));
            } else {
                salas[sala].mensajesPendientes.push(mensaje);
            }
            return res.json({ mensaje: "Avatar seleccionado con éxito" });
        }
    }
    res.status(404).json({ error: "Jugador no encontrado" });
});

app.get('/obtener-host', (req, res) => {
    const sala = req.query.sala;

    if (!salas[sala]) {
        return res.status(404).json({ error: "Sala no encontrada" });
    }

    const jugadores = salas[sala].jugadores; // Obtener el array de jugadores

    if (!jugadores || !Array.isArray(jugadores)) {
        return res.status(500).json({ error: "Estructura de jugadores inválida" });
    }

    const host = jugadores.find(jugador => jugador.id === 0); // Buscar al jugador con id 0 (host)

    if (host) {
        res.json({ nombreHost: host.nombre });
    } else {
        res.status(404).json({ error: "Host no encontrado" });
    }
});

app.get("/jugadores", (req, res) => {
    const sala = req.query.sala;

    if (!sala || !salas[sala]) {
        return res.status(404).json({ error: "Sala no encontrada" });
    }

    const jugadores = salas[sala].jugadores.map(j => ({
        id: j.id,
        nombre: j.nombre,
        ready: j.isReady,
        avatar: j.avatar
    }));

    res.json(jugadores);
});

wss.on("connection", (ws) => {
    console.log("✅ Nuevo WebSocket conectado.");
    let playerId = null;
    let salaActual = null;

    // Setup heartbeat
    const interval = setInterval(() => {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ tipo: "ping" }));
        } else {
            clearInterval(interval);
        }
    }, 15000);

    ws.on("message", (msg) => {
        let data;
        try {
            data = JSON.parse(msg.toString());
        } catch (error) {
            console.log("❌ Error al parsear mensaje JSON:", error);
            return;
        }

        if (data.tipo === "unir") {
            let { sala, nombre } = data;
            salaActual = sala;

            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }

            // Verificar si el jugador ya existe por nombre
            let jugadorExistente = salas[sala].jugadores.find(j => j.nombre === nombre);
            if (jugadorExistente) {
                console.log(`⚠️ El jugador ${nombre} ya estaba en la sala, actualizando WebSocket.`);
                jugadorExistente.ws = ws;
                playerId = jugadorExistente.id;

                ws.send(JSON.stringify({ 
                    tipo: "confirmacion-union", 
                    id: playerId,
                    reconectado: true,
                    avatar: jugadorExistente.avatar
                }));
                return;
            }

            let avatarExistente = null;
            for (let otraSala in salas) {
                if (otraSala !== sala) {
                    let jugadorEnOtraSala = salas[otraSala].jugadores.find(j => j.nombre === nombre);
                    if (jugadorEnOtraSala && jugadorEnOtraSala.avatar) {
                        avatarExistente = jugadorEnOtraSala.avatar;
                        console.log(`ℹ️ Recuperado avatar ${avatarExistente} de jugador ${nombre} desde sala ${otraSala}`);
                        break;
                    }
                }
            }

            playerId = salas[sala].jugadores.length;
            salas[sala].jugadores.push({ 
                id: playerId, 
                ws, 
                nombre, 
                avatar: avatarExistente, 
                activo: true,
                isReady: false
            });

            console.log(`✅ Jugador ${nombre} (${playerId}) unido a la sala ${sala}`);

            if (salas[sala].juego && salas[sala].juego.readyState === 1) {
                try {
                    salas[sala].juego.send(JSON.stringify({ 
                        tipo: "nuevo-jugador", 
                        id: playerId, 
                        nombre 
                    }));
                    console.log("✅ Mensaje enviado a Unity.");

                    if (avatarExistente) {
                        salas[sala].juego.send(JSON.stringify({ 
                            tipo: "avatar-seleccionado", 
                            id: playerId, 
                            avatar: avatarExistente 
                        }));
                        console.log(`✅ Enviado avatar existente ${avatarExistente} para jugador ${nombre}`);
                    }
                } catch (error) {
                    console.log("❌ Error enviando mensaje a Unity:", error);
                    salas[sala].mensajesPendientes.push({ 
                        tipo: "nuevo-jugador", 
                        id: playerId, 
                        nombre 
                    });

                    if (avatarExistente) {
                        salas[sala].mensajesPendientes.push({
                            tipo: "avatar-seleccionado",
                            id: playerId,
                            avatar: avatarExistente
                        });
                    }
                }
            } else {
                console.log("⚠️ WebSocket de Unity no está conectado. Guardando mensaje para envío posterior.");
                salas[sala].mensajesPendientes.push({ 
                    tipo: "nuevo-jugador", 
                    id: playerId, 
                    nombre 
                });

                if (avatarExistente) {
                    salas[sala].mensajesPendientes.push({
                        tipo: "avatar-seleccionado",
                        id: playerId,
                        avatar: avatarExistente
                    });
                }
            }

            ws.send(JSON.stringify({ 
                tipo: "confirmacion-union", 
                id: playerId,
                avatar: avatarExistente 
            }));

        } else if (data.tipo === "ready") {
            let { sala, id } = data;
    
            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }
    
            let jugador = salas[sala].jugadores.find(j => j.id === id);
            if (jugador) {
                jugador.isReady = true;
                console.log(`✅ Jugador ${jugador.nombre} está listo en la sala ${sala}.`);
    
                // Notificar solo a Unity
                const mensajeReady = JSON.stringify({
                    tipo: "actualizar-ready",
                    id: jugador.id,
                    nombre: jugador.nombre,
                    isReady: true
                });

                if (salas[sala].juego && salas[sala].juego.readyState === 1) {
                    salas[sala].juego.send(mensajeReady);
                }
            }

        } else if (data.tipo === "juego") {
            let { sala } = data;
            salaActual = sala;

            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }

            salas[sala].juego = ws;
            console.log(`🎮 Unity conectado a la sala ${sala}`);

            if (salas[sala].mensajesPendientes.length > 0) {
                console.log(`📤 Enviando ${salas[sala].mensajesPendientes.length} mensajes pendientes a Unity`);
                salas[sala].mensajesPendientes.forEach(mensaje => {
                    ws.send(JSON.stringify(mensaje));
                });
                salas[sala].mensajesPendientes = [];
            }

            salas[sala].jugadores.forEach(jugador => {
                if (jugador.activo) {
                    ws.send(JSON.stringify({
                        tipo: "nuevo-jugador",
                        id: jugador.id,
                        nombre: jugador.nombre
                    }));

                    if (jugador.avatar) {
                        ws.send(JSON.stringify({
                            tipo: "avatar-seleccionado",
                            id: jugador.id,
                            avatar: jugador.avatar
                        }));
                    }
                }
            });
        } else if (data.tipo === "comenzar-partida") {
            const sala = data.sala;
        
            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada para comenzar la partida" }));
                return;
            }
        
            // ✅ Validar que todos estén listos
            const todosListos = salas[sala].jugadores.every(jugador => jugador.isReady);
        
            if (!todosListos) {
                ws.send(JSON.stringify({ tipo: "error-jugadores-no-listos" }));
                return;
            }
        
            // Enviar a todos los jugadores que la partida comenzó
            const mensaje = JSON.stringify({ tipo: "partida-iniciada" });
        
            salas[sala].jugadores.forEach(jugador => {
                if (jugador.ws && jugador.ws.readyState === 1) {
                    jugador.ws.send(mensaje);
                }
            });
        
            // Enviar también a Unity si está conectado
            if (salas[sala].juego && salas[sala].juego.readyState === 1) {
                salas[sala].juego.send(mensaje);
            }
        
            console.log(`🚀 Partida comenzada en sala ${sala}`);

        } else if (data.tipo === "activar_pulsadores") {
            const sala = data.sala;
        
            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada para activar pulsadores" }));
                return;
            }
        
            const mensaje = JSON.stringify({ tipo: "activar_pulsadores" });
        
            salas[sala].jugadores.forEach(jugador => {
                if (jugador.ws && jugador.ws.readyState === 1) {
                    jugador.ws.send(mensaje);
                }
            });
            console.log(`🔔 Pulsadores activados en la sala ${sala}`);
            
        } else if (data.tipo === "pulsador_presionado") {
            const { sala, id } = data;
        
            if (!salas[sala]) return;
        
            console.log(`🟢 Jugador ${id} presionó el pulsador en la sala ${sala}`);
        
            // Notificar a Unity
            if (salas[sala].juego && salas[sala].juego.readyState === 1) {
                salas[sala].juego.send(JSON.stringify({
                    tipo: "pulsador_presionado",
                    id: id
                }));
            }
        
            // Desactivar los pulsadores de los demás jugadores
            salas[sala].jugadores.forEach(jugador => {
                if (jugador.id !== id && jugador.ws && jugador.ws.readyState === 1) {
                    jugador.ws.send(JSON.stringify({
                        tipo: "desactivar_pulsador"
                    }));
                }
            });
        }

    });

    ws.on("close", () => {
        if (salaActual && salas[salaActual]) {
            // Buscar al jugador en la sala actual
            const jugadorIndex = salas[salaActual].jugadores.findIndex(j => j.id === playerId);
    
            if (jugadorIndex !== -1) {
                const jugador = salas[salaActual].jugadores[jugadorIndex];
    
                // Marcar al jugador como inactivo
                console.log(`❌ Jugador ${playerId} desconectado de la sala ${salaActual}`);
                jugador.activo = false;
    
                // Notificar a Unity sobre la desconexión del jugador
                if (salas[salaActual].juego && salas[salaActual].juego.readyState === 1) {
                    salas[salaActual].juego.send(JSON.stringify({
                        tipo: "jugador-desconectado",
                        id: playerId
                    }));
                } else {
                    salas[salaActual].mensajesPendientes.push({
                        tipo: "jugador-desconectado",
                        id: playerId
                    });
                }
    
                // Eliminar al jugador completamente de la sala si no está activo
                salas[salaActual].jugadores.splice(jugadorIndex, 1);
            }
    
            // Si Unity está desconectado, marcarlo como desconectado
            if (salas[salaActual].juego === ws) {
                console.log(`⚠️ Unity desconectado de la sala ${salaActual}`);
                salas[salaActual].juego = null;
            }
    
            // Verificar si la sala está vacía (sin jugadores ni Unity)
            if (
                salas[salaActual].jugadores.length === 0 &&
                (!salas[salaActual].juego || salas[salaActual].juego.readyState !== 1)
            ) {
                console.log(`🗑️ Eliminando sala vacía: ${salaActual}`);
                delete salas[salaActual];
            }
        }
    
        console.log("⚠️ Un WebSocket se ha desconectado.");
        clearInterval(interval);
    });
});
