import * as http from 'http';
import { WebSocketServer } from 'ws';
import * as redis from 'redis';

import { Connection } from './stream';
import authenticate from './authenticate';
import { EventEmitter } from 'events';
import config from '../../config';

module.exports = (server: http.Server) => {
	// Init websocket server
	const ws = new WebSocketServer({ noServer: true });

	server.on('upgrade', async (request, socket, head)=> {
		if (!request.url.startsWith('/streaming?')) {
			socket.write('HTTP/1.1 400 Bad Request\r\n\r\n', undefined, () => socket.destroy());
			return;
		}
		const q = new URLSearchParams(request.url.slice(11));

		const [user, app] = await authenticate(q.get('i'))
			.catch(err => {
				socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n', undefined, () => socket.destroy());
				return [];
			});
		if (typeof user === 'undefined') return;

		if (user?.isSuspended) {
			request.reject(400);
			socket.write('HTTP/1.1 403 Forbidden\r\n\r\n', undefined, () => socket.destroy());
			return;
		}

		ws.handleUpgrade(request, socket, head, (socket) => {

			let ev: EventEmitter;

			// Connect to Redis
			const subscriber = redis.createClient(
				config.redis.port,
				config.redis.host,
				{
					password: config.redis.pass
				}
			);

			subscriber.subscribe(config.host);

			ev = new EventEmitter();

			subscriber.on('message', async (_, data) => {
				const obj = JSON.parse(data);

				ev.emit(obj.channel, obj.message);
			});

			socket.once('close', () => {
				subscriber.unsubscribe();
				subscriber.quit();
			});

			const main = new Connection(socket, ev, user, app);

			// ping/pong mechanism
			let pingTimeout: NodeJS.Timeout | null = null;
			let disconnectTimeout = setTimeout(() => {
				socket.terminate();
			}, 1000 * 60);;
			function sendPing() {
				socket.ping();
				pingTimeout = setTimeout(() => {
					sendPing();
				}, 1000 * 30);
			}
			function onPong() {
				disconnectTimeout.refresh()
			}
			sendPing();
			socket.on('pong', onPong);

			socket.once('close', () => {
				ev.removeAllListeners();
				main.dispose();
				if (pingTimeout) clearTimeout(pingTimeout);
				if (disconnectTimeout) clearTimeout(disconnectTimeout);
			});

			// ping/pong mechanism
			// TODO: the websocket protocol already specifies a ping/pong mechanism, why is this necessary?
			socket.on('message', async (data) => {
				if (data.toString() === 'ping') {
					socket.send('pong');
				}
			});
		});
	});
};
