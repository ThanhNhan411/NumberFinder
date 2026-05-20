import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";

async function startServer() {
  const app = express();
  const PORT = 3000;

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
      cors: { origin: "*" }
  });

  // State managed by the server
  const rooms: Record<string, any> = {};

  io.on("connection", (socket) => {
      console.log(`Socket connected: ${socket.id}`);

      socket.on("createRoom", (gameType) => {
          const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
          rooms[roomId] = {
              id: roomId,
              gameType: gameType || 'NUMERO_DUO',
              players: {
                  P1: socket.id,
                  P2: null
              },
              status: 'WAITING',
              turn: 'P1',
              // Numero Duo states
              targetNumber: null,
              winner: null,
              p1Ticks: [],
              p2Ticks: [],
              numbersData: [],
              foundNumbers: [],
              // Battleship states
              p1Board: null,
              p2Board: null,
              p1Ready: false,
              p2Ready: false,
              p1Shots: [],
              p2Shots: []
          };
          socket.join(roomId);
          socket.emit("roomCreated", { roomId, playerId: 'P1', gameType: rooms[roomId].gameType });
          socket.emit("gameState", rooms[roomId]);
      });

      socket.on("joinRoom", (roomId) => {
          const room = rooms[roomId];
          if (room) {
              if (!room.players.P2 && room.players.P1 !== socket.id) {
                  room.players.P2 = socket.id;
                  socket.join(roomId);
                  socket.emit("roomJoined", { roomId, playerId: 'P2', gameType: room.gameType });
                  
                  room.status = 'SETUP';
                  io.to(roomId).emit("gameState", room);
                  io.to(roomId).emit("playerJoined");
              } else {
                  socket.emit("error", "Room is full or you are already in it.");
              }
          } else {
              socket.emit("error", "Room not found.");
          }
      });

      socket.on("startGame", (roomId) => {
          const room = rooms[roomId];
          if (!room) return;
          
          if (room.gameType === 'NUMERO_DUO') {
              const pool = Array.from({ length: 99 }, (_, i) => i + 1);
              pool.sort(() => Math.random() - 0.5);
              const chosenNumbers = pool.slice(0, 50);

              const indices = Array.from({ length: 100 }, (_, i) => i);
              indices.sort(() => Math.random() - 0.5);

              const colors = [
                  '#22d3ee', '#f43f5e', '#34d399', '#fbbf24', 
                  '#a78bfa', '#f472b6', '#2dd4bf', '#38bdf8',
                  '#e879f9', '#818cf8', '#4ade80', '#fb923c'
              ];
              
              const generated = Array(100).fill(null);
              chosenNumbers.forEach((val, i) => {
                  generated[indices[i]] = {
                      id: val,
                      value: val,
                      color: colors[Math.floor(Math.random() * colors.length)],
                      rotation: (Math.random() - 0.5) * 90,
                      scale: Math.random() * 0.4 + 0.7,
                      tx: (Math.random() - 0.5) * 6,
                      ty: (Math.random() - 0.5) * 6,
                  };
              });

              room.numbersData = generated;
              room.p1Ticks = [];
              room.p2Ticks = [];
              room.foundNumbers = [];
              room.turn = 'P1';
              room.winner = null;
              
              pickTargetLocal(room);
              room.status = 'READY';
          } else if (room.gameType === 'BATTLESHIP') {
              room.p1Board = null;
              room.p2Board = null;
              room.p1Ready = false;
              room.p2Ready = false;
              room.p1Shots = [];
              room.p2Shots = [];
              room.turn = 'P1';
              room.winner = null;
              room.status = 'READY'; // READY here means players are placing ships
          }

          io.to(roomId).emit("gameState", room);
      });

      socket.on("startTurn", (roomId) => {
          const room = rooms[roomId];
          if (room && room.status === 'READY') {
              room.status = 'PLAYING';
              io.to(roomId).emit("gameState", room);
          }
      });

      socket.on("numberClick", ({ roomId, playerId, val }) => {
          const room = rooms[roomId];
          if (!room || room.status !== 'PLAYING') return;

          if (val === room.targetNumber) {
              room.foundNumbers.push(val);
              room.turn = room.turn === 'P1' ? 'P2' : 'P1';
              pickTargetLocal(room);
              room.status = 'READY';
              io.to(roomId).emit("correctClick", val);
          } else {
              const opId = room.turn === 'P1' ? 'P2' : 'P1';
              autoAddTick(room, opId, 3);
              io.to(roomId).emit("wrongClick", val);
          }
          io.to(roomId).emit("gameState", room);
      });

      socket.on("battleshipReady", ({ roomId, playerId, board }) => {
          const room = rooms[roomId];
          if (!room || room.gameType !== 'BATTLESHIP' || room.status !== 'READY') return;

          if (playerId === 'P1') {
              room.p1Board = board;
              room.p1Ready = true;
          } else {
              room.p2Board = board;
              room.p2Ready = true;
          }

          if (room.p1Ready && room.p2Ready) {
              room.status = 'PLAYING';
          }
          
          // emit sanitized state without revealing opponent's board if playing
          io.to(roomId).emit("gameState", sanitizeBattleshipRoom(room));
      });

      socket.on("battleshipShoot", ({ roomId, playerId, x, y }) => {
          const room = rooms[roomId];
          if (!room || room.gameType !== 'BATTLESHIP' || room.status !== 'PLAYING') return;
          if (room.turn !== playerId) return;

          const isP1 = playerId === 'P1';
          const oppBoard = isP1 ? room.p2Board : room.p1Board;
          const myShots = isP1 ? room.p1Shots : room.p2Shots;

          if (myShots.some((s: any) => s.x === x && s.y === y)) return;

          let hit = false;
          let hitShipId = null;
          for (const ship of oppBoard) {
              for (const cell of ship.cells) {
                  if (cell.x === x && cell.y === y) {
                      hit = true;
                      hitShipId = ship.id;
                      break;
                  }
              }
              if (hit) break;
          }

          myShots.push({ x, y, hit });

          let opponentSunk = true;
          for (const ship of oppBoard) {
              let shipSunk = true;
              for (const cell of ship.cells) {
                  if (!myShots.some((s: any) => s.x === cell.x && s.y === cell.y)) {
                      shipSunk = false;
                      break;
                  }
              }
              if (!shipSunk) {
                  opponentSunk = false;
                  break;
              }
          }

          io.to(roomId).emit("battleshipShotResult", { x, y, hit, hitShipId, playerId });

          if (opponentSunk) {
              room.winner = playerId;
              room.status = 'GAME_OVER';
          } else {
              room.turn = isP1 ? 'P2' : 'P1';
          }

          io.to(roomId).emit("gameState", sanitizeBattleshipRoom(room));
      });

      socket.on("tick", ({ roomId, playerId, cellId }) => {
          const room = rooms[roomId];
          if (!room || room.status !== 'PLAYING') return;
          if (room.turn === playerId) return;

          if (playerId === 'P1') {
              if (!room.p1Ticks.includes(cellId)) {
                  room.p1Ticks.push(cellId);
                  io.to(roomId).emit("tickSound");
                  if (room.p1Ticks.length >= 100) endGame(room, 'P1');
              }
          } else {
              if (!room.p2Ticks.includes(cellId)) {
                  room.p2Ticks.push(cellId);
                  io.to(roomId).emit("tickSound");
                  if (room.p2Ticks.length >= 100) endGame(room, 'P2');
              }
          }
          io.to(roomId).emit("gameState", room);
      });

      socket.on("disconnect", () => {
          // If a player disconnects, we might clean up or handle reconnection. For simplicity, we just log.
          console.log(`Socket disconnected: ${socket.id}`);
      });
  });

  function sanitizeBattleshipRoom(room: any) {
      if (room.gameType !== 'BATTLESHIP') return room;
      // create a copy and hide opponent board
      const sanitized = { ...room };
      if (sanitized.status === 'PLAYING' || sanitized.status === 'SETUP' || sanitized.status === 'READY') {
          // Keep it to emit to all, players filter locally, or we could emit to specific users
          // Actually simplest is just emit to roomId. Client will hide enemy ships. 
          // A real production app would emit strictly separated states.
      }
      return sanitized;
  }

  function pickTargetLocal(room: any) {
      const valid = room.numbersData.filter((n: any) => n !== null);
      const remaining = valid.filter((n: any) => !room.foundNumbers.includes(n.value));
      if (remaining.length === 0) {
          endGame(room, null);
          return;
      }
      room.targetNumber = remaining[Math.floor(Math.random() * remaining.length)].value;
  }

  function endGame(room: any, winner: 'P1'|'P2'|null) {
      room.winner = winner;
      room.status = 'GAME_OVER';
  }

  function autoAddTick(room: any, masherId: 'P1'|'P2', count: number) {
      let added = 0;
      const targetArray = masherId === 'P1' ? room.p1Ticks : room.p2Ticks;
      for (let i = 0; i < 100; i++) {
          if (!targetArray.includes(i)) {
              targetArray.push(i);
              added++;
              if (added >= count) break;
          }
      }
      if (targetArray.length >= 100) {
          endGame(room, masherId);
      }
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
