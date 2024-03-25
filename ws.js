require('dotenv').config({ path: '_brb.env' })
const fs = require('fs')
const HttpsServer = require(process.env.HOST_BRB_PROTOCOL).createServer
const WebSocket = require('ws').Server
const mysql = require('mysql')
const MySQLEvents = require('@rodrigogs/mysql-events')
const jwt = require('jsonwebtoken')
const axios = require('axios')

class Server {
	constructor() {
		this.cert =
			process.env.HOST_BRB_PROTOCOL === 'https'
				? {
						cert: fs.readFileSync(process.env.SERVER_BRB_CERT),
						key: fs.readFileSync(process.env.SERVER_BRB_KEY),
				  }
				: {}

		this.server = HttpsServer(this.cert)
		this.wss = new WebSocket({ server: this.server })
	}

	sendToClient(client, data, isBinary = false) {
		if (client._readyState) {
			if (!isBinary) client.send(JSON.stringify(data), { binary: false })
			else {
				const enc = new TextEncoder()
				const blob = enc.encode(JSON.stringify(data))
				client.send(blob, { binary: true })
			}
		}
	}

	handleEvent(event) {
		if (event.table === 'messages') {
			const data = {
				message_sended: [],
				message_readed: [],
			}

			event.affectedRows.forEach((row) => {
				let type
				switch (event.type) {
					case 'INSERT':
						type = 'message_sended'
						break
					case 'UPDATE':
						type = 'message_readed'
						break
					default:
						break
				}
				const json = {
					event: type,
					data: {
						id: row.after.id,
						senderId: row.after.sender_id,
						receiverId: row.after.reciever_id,
						text: row.after.text,
						time: Date.parse(row.after.time).toString() / 1000,
						unread: row.after.unread,
						attachments: JSON.parse(row.after.attachment),
					},
				}
				data[type].push(json)
			})

			Object.entries(data).forEach(([k, i]) => {
				i.forEach((evt) => {
					this.sendToClient(evt.data.senderId, evt)
					this.sendToClient(evt.data.receiverId, evt)
				})
			})
		}
	}

	handleError(err) {
		console.error('\x1b[31m%s\x1b[0m', err)
		process.exit(5)
	}

	parseCookie(str) {
		return str
			.split(';')
			.map((v) => v.split('='))
			.reduce((acc, v) => {
				acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim())
				return acc
			}, {})
	}

	async start() {
		await this.server.listen(3000)
		this.wss.on('connection', this.handleConnection.bind(this))
	}

	handleConnection(ws, req) {
		try {
			ws.params = new URL(req.url, `https://${req.headers.host}`)
			if (req.headers.cookie) {
				ws.token = this.rot13(this.parseCookie(req.headers.cookie).token)
			} else if (ws.params.searchParams.has('token')) {
				ws.token = this.rot13(ws.params.searchParams.get('token'))
			}

			const decoded = jwt.verify(ws.token, process.env.JWT_BRB_KEY)
			ws.id = decoded.aud
			if (!ws.id) return ws.close(1011)

			const bytes = process.memoryUsage()
			console.log('\x1b[34m%s\x1b[0m', `Connected id${decoded.aud}`)
			console.log(`Memory usage: ${Math.round(bytes.heapUsed / 1000000)}MB`)

			axios({
				method: 'get',
				url: `${process.env.HOST_BRB_API}/online`,
				timeout: 5000,
				headers: {
					Authorization: `Bearer ${ws.token}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
			}).then((res) => {
				// Handle response
			})
		} catch (e) {
			const msg = { error: 401, message: 'Token is invalid or missing' }
			console.warn('\x1b[31m%s\x1b[0m', msg.message)

			this.sendToClient(ws.id, msg)
			ws.close(1011)
		}

		ws.on('message', this.handleMessage.bind(this, ws))
		ws.on('error', this.handleError.bind(this))
		ws.onclose = (e) => {
			console.log('\x1b[35m%s\x1b[0m', `Client ${ws.id ?? ''} has disconnected! [${e.code !== undefined ? e.code : e}]`);

		}
	}

	handleMessage(ws, data) {
		try {
			const json = JSON.parse(Buffer.from(data, 'base64').toString())
			if (json.type === 'message_send') {
				if (json.user && json.text && json.request) {
					const recieverId = json.user ?? 0
					const message = new URLSearchParams({
						text: json.text,
					})

					axios({
						method: 'post',
						url: `${process.env.HOST_BRB_API}/users/${recieverId}/messages`,
						timeout: 5000,
						data: message,
						headers: {
							Authorization: `Bearer ${ws.token}`,
							'Content-Type': 'application/x-www-form-urlencoded',
							Request: json.request ?? null,
							'Parse-mode': ws.params.searchParams.get('Parse-mode') ?? 'html',
						},
					})
						.then((res) => {
							console.log(`Sent by id${ws.id} to id${recieverId}`)
              console.log(res.data)
							//this.sendToClient(ws, res.response.data)
              
						})
						.catch((res) => {
							this.sendToClient(ws, res.response.data)
							console.error('\x1b[31m%s\x1b[0m', res.response.data.message)
							ws.close(1011)
						})
				}
			}
			if (json.type === 'message_type') {
				const timeInMs = Date.now()
				this.sendToClient(json.user, {
					event: 'message_typing',
					data: { timestamp: timeInMs, status: json.status },
				})
			}
		} catch (e) {
			console.error('\x1b[31m%s\x1b[0m', e)
			this.sendToClient(ws, e)
		}
	}

	rot13(str) {
		const answer = []
		for (const i in str) {
			if (str.charCodeAt(i) < 65 || str.charCodeAt(i) > 91) {
				answer.push(str[i])
				continue
			} else {
				if (str.charCodeAt(i) < 78) {
					answer.push(String.fromCharCode(str.charCodeAt(i) + 13))
					continue
				} else {
					answer.push(String.fromCharCode(str.charCodeAt(i) - 13))
					continue
				}
			}
		}
		return answer.join('')
	}
}

const app = async () => {
	const connection = mysql.createPool({
		host: process.env.DB_BRB_SERVER,
		user: process.env.DB_BRB_USERNAME,
		database: process.env.DB_BRB_DATABASE,
		password: process.env.DB_BRB_PASSWORD,
		port: 3306,
	})
	const instance = new MySQLEvents(connection, {
		startAtEnd: true,
		includeSchema: {
			barybians: true,
		},
	})

	await instance.start()
	instance.addTrigger({
		name: 'TEST',
		expression: '*',
		statement: MySQLEvents.STATEMENTS.ALL,
		onEvent: (e) => this.handleEvent(e),
	})

	instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, (err) => this.handleError(`MySQL disconnected: ${err}`))
	instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, console.error)
}

const server = new Server()
server
	.start()
	.then(() => console.log('\x1b[32m%s\x1b[0m', 'Listening'))
	.catch((err) => server.handleError(`MySQL connection error: ${err}`))
