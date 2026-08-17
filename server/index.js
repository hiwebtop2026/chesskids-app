/**
 * ChessKids - 联网对战 WebSocket 服务器
 * 基于 Node.js + ws 库，端口 3001
 *
 * 支持的消息类型：
 *   客户端 -> 服务器: CREATE_ROOM / JOIN_ROOM / MAKE_MOVE / RESET_GAME / LEAVE_ROOM / CHAT / PING
 *   服务器 -> 客户端: ROOM_CREATED / JOIN_SUCCESS / JOIN_ERROR / OPPONENT_JOINED /
 *                     MOVE / GAME_RESET / OPPONENT_LEFT / CHAT / PONG / ERROR
 *
 * 每个房间最多 2 人，自动分配白/黑方。
 * 使用 6 位随机字母数字作为房间码。
 * 支持心跳检测（ping/pong）。
 */

import { WebSocketServer, WebSocket } from 'ws';

const PORT = 3001;

// ===== 房间管理 =====

/** 生成 6 位随机字母数字房间码 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * 房间数据结构
 * @property {string} code       - 房间码
 * @property {Map} players       - WebSocket -> { color, name } 映射
 * @property {string} turn       - 当前回合 'w' | 'b'
 */
function createRoom(code) {
  return {
    code,
    players: new Map(),
    turn: 'w',
  };
}

/** 所有活跃房间：roomCode -> room */
const rooms = new Map();

/** WebSocket -> roomCode 反向映射，便于通过连接查找房间 */
const socketRoom = new Map();

/** 获取房间内所有已连接的玩家 WebSocket 列表 */
function getRoomPlayers(room) {
  return Array.from(room.players.keys());
}

/** 向房间内所有玩家广播消息（可排除某个 socket） */
function broadcast(room, message, exclude = null) {
  const data = JSON.stringify(message);
  for (const client of room.players.keys()) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

/** 向单个客户端发送消息 */
function sendTo(client, message) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

// ===== WebSocket 服务器 =====

const wss = new WebSocketServer({ port: PORT });

console.log(`[ChessKids] 联网对战服务器已启动，端口 ${PORT}`);

wss.on('connection', (ws) => {
  console.log('[ChessKids] 新客户端连接');

  // 为每个连接初始化心跳状态
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      sendTo(ws, { type: 'ERROR', message: '无效的消息格式' });
      return;
    }

    switch (msg.type) {
      // ===== 创建房间 =====
      case 'CREATE_ROOM': {
        // 生成唯一房间码
        let code;
        do {
          code = generateRoomCode();
        } while (rooms.has(code));

        const room = createRoom(code);
        room.players.set(ws, { color: 'w', name: msg.name || '玩家1' });
        rooms.set(code, room);
        socketRoom.set(ws, code);

        console.log(`[ChessKids] 房间已创建: ${code}`);
        sendTo(ws, {
          type: 'ROOM_CREATED',
          roomCode: code,
          color: 'w',
        });
        break;
      }

      // ===== 加入房间 =====
      case 'JOIN_ROOM': {
        const code = (msg.roomCode || '').toUpperCase();
        const room = rooms.get(code);

        if (!room) {
          sendTo(ws, { type: 'JOIN_ERROR', message: '房间不存在' });
          break;
        }
        if (room.players.size >= 2) {
          sendTo(ws, { type: 'JOIN_ERROR', message: '房间已满' });
          break;
        }

        // 分配黑方
        const color = 'b';
        const playerName = msg.name || '玩家2';
        room.players.set(ws, { color, name: playerName });
        socketRoom.set(ws, code);

        sendTo(ws, {
          type: 'JOIN_SUCCESS',
          roomCode: code,
          color,
        });

        // 通知房间内已有玩家：对手已加入
        const joinerInfo = { name: playerName, color };
        broadcast(room, {
          type: 'OPPONENT_JOINED',
          opponent: joinerInfo,
        }, ws);

        // 向新加入者告知已有对手信息
        for (const [client, info] of room.players.entries()) {
          if (client !== ws) {
            sendTo(ws, {
              type: 'OPPONENT_JOINED',
              opponent: { name: info.name, color: info.color },
            });
            break;
          }
        }

        console.log(`[ChessKids] 玩家加入房间: ${code}`);
        break;
      }

      // ===== 走棋同步 =====
      case 'MAKE_MOVE': {
        const code = socketRoom.get(ws);
        if (!code) break;
        const room = rooms.get(code);
        if (!room) break;

        const player = room.players.get(ws);
        if (!player) break;

        // 校验是否轮到该玩家
        if (player.color !== room.turn) {
          sendTo(ws, { type: 'ERROR', message: '还没有轮到你走棋' });
          break;
        }

        const { from, to } = msg;
        if (!from || !to) break;

        // 切换回合
        room.turn = room.turn === 'w' ? 'b' : 'w';

        // 广播给房间内所有玩家（包括走棋者，走棋者客户端可自行忽略自己的回声）
        broadcast(room, {
          type: 'MOVE',
          from,
          to,
          by: player.color,
        });

        console.log(`[ChessKids] 房间 ${code} 走棋: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
        break;
      }

      // ===== 重开游戏 =====
      case 'RESET_GAME': {
        const code = socketRoom.get(ws);
        if (!code) break;
        const room = rooms.get(code);
        if (!room) break;

        room.turn = 'w';
        broadcast(room, { type: 'GAME_RESET' });

        console.log(`[ChessKids] 房间 ${code} 游戏重置`);
        break;
      }

      // ===== 离开房间 =====
      case 'LEAVE_ROOM': {
        handleLeave(ws);
        break;
      }

      // ===== 房间聊天 =====
      case 'CHAT': {
        const code = socketRoom.get(ws);
        if (!code) break;
        const room = rooms.get(code);
        if (!room) break;

        const player = room.players.get(ws);
        if (!player) break;

        broadcast(room, {
          type: 'CHAT',
          from: player.color,
          message: msg.message || '',
          timestamp: Date.now(),
        });
        break;
      }

      // ===== 心跳 =====
      case 'PING': {
        sendTo(ws, { type: 'PONG', timestamp: Date.now() });
        break;
      }

      default:
        sendTo(ws, { type: 'ERROR', message: `未知消息类型: ${msg.type}` });
    }
  });

  ws.on('close', () => {
    handleLeave(ws);
    console.log('[ChessKids] 客户端断开连接');
  });

  ws.on('error', (err) => {
    console.error('[ChessKids] 连接错误:', err.message);
    handleLeave(ws);
  });
});

// ===== 离开房间处理 =====

function handleLeave(ws) {
  const code = socketRoom.get(ws);
  if (!code) return;

  const room = rooms.get(code);
  if (!room) {
    socketRoom.delete(ws);
    return;
  }

  const player = room.players.get(ws);
  room.players.delete(ws);
  socketRoom.delete(ws);

  if (room.players.size === 0) {
    // 房间空了，删除房间
    rooms.delete(code);
    console.log(`[ChessKids] 房间 ${code} 已销毁（无人）`);
  } else {
    // 通知剩余玩家对手已离开
    broadcast(room, { type: 'OPPONENT_LEFT', leftColor: player?.color || null });
    console.log(`[ChessKids] 房间 ${code} 一名玩家离开`);
  }
}

// ===== 心跳检测 =====
// 每 30 秒向所有客户端发送 ping，如果客户端未响应 pong 则判定为断开

const HEARTBEAT_INTERVAL = 30000;

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      // 未响应上一次 ping，终止连接
      handleLeave(ws);
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// ===== 优雅关闭 =====

process.on('SIGINT', () => {
  console.log('\n[ChessKids] 服务器正在关闭...');
  wss.clients.forEach((ws) => {
    sendTo(ws, { type: 'ERROR', message: '服务器已关闭' });
    ws.close();
  });
  wss.close();
  process.exit(0);
});
