;(function () {
  console.log('\x1b[31m%s\x1b[0m', '───────────────')
  var date = new Date()
  console.log(date.toDateString())
  delete date
})()
require('log-timestamp')(() => {
  return `[${new Date().toLocaleTimeString('ru-RU')}] %s`
})
require('dotenv').config({ path: '_brb.env' })
const HttpsServer = require(process.env.HOST_BRB_PROTOCOL).createServer //https
const WebSocket = require('ws').Server
const fs = require('fs')

if (process.env.HOST_BRB_PROTOCOL === 'https') {
  server = HttpsServer({
    cert: fs.readFileSync(process.env.SERVER_BRB_CERT),
    key: fs.readFileSync(process.env.SERVER_BRB_KEY),
  })
} else server = HttpsServer()

const wss = new WebSocket({ server: server })
const mysql = require('mysql')
const MySQLEvents = require('@rodrigogs/mysql-events')
const jwt = require('jsonwebtoken')
const axios = require('axios')
//const users = []

function Send(id, data, isBinary = false) {
  wss.clients.forEach((c) => {
    if (c.id == id && c._readyState) {
      // === WebSocket.OPEN
      if (!isBinary) c.send(JSON.stringify(data), { binary: false })
      else {
        const enc = new TextEncoder()
        const blob = enc.encode(JSON.stringify(data))
        c.send(blob, { binary: true })
      }
    }
  })
}
function Event(event) {
  if (event.table === 'messages') {
    const data = []
    data['message_sended'] = []
    data['message_readed'] = []
    event.affectedRows.forEach((e) => {
      var type
      if (event.type === 'INSERT') type = 'message_sended'
      else if (event.type === 'UPDATE') type = 'message_readed'
      var json = {
        event: type,
        data: {
          id: e.after.id,
          senderId: e.after.sender_id,
          receiverId: e.after.reciever_id,
          text: e.after.text,
          utime: Date.parse(e.after.time).toString() / 1000,
          unread: e.after.unread,
          attachments: JSON.parse(e.after.attachment),
        },
      }
      data[type].push(json)
    })
    Object.entries(data).forEach(([k, i]) => {
      i.forEach((evt) => {
        Send(evt.data.senderId, evt)
        Send(evt.data.receiverId, evt)
      })
    })
    return
  }
  // if (event.table === 'users') {
  //   if (event.type === 'UPDATE') {
  //     //console.log(event.affectedRows)
  //   }
  // }
}

const parseCookie = (str) =>
  str
    .split(';')
    .map((v) => v.split('='))
    .reduce((acc, v) => {
      acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim())
      return acc
    }, {})
const rot13 = (str) => {
  var answer = []
  for (var i in str) {
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
server.listen(3000)
////ws.js >log-file.txt 2>error-file.txt
wss.on('connection', (ws, req) => {
  try {
    ws.params = new URL(req.url, `https://${req.headers.host}`)
    //console.log(ws.params.searchParams.token)
    if (req.headers.cookie) {
      ws.token = rot13(parseCookie(req.headers.cookie).token)
    } else if (ws.params.searchParams.has('token')) {
      ws.token = rot13(ws.params.searchParams.get('token'))
    }
    //ws.token = parseCookie(req.headers.cookie).token;//hosting
    //console.log(ws.params)
    const decoded = jwt.verify(ws.token, process.env.JWT_BRB_KEY)
    ws.id = decoded.aud
    if (!ws.id) return ws.close(1011)
    //users.push(decoded.aud)
    const bytes = process.memoryUsage()
    console.log('Memory usage:', bytes.rss)
    console.log('\x1b[34m%s\x1b[0m', `Connected id${decoded.aud}`)
    axios({
      method: 'get',
      url: `${process.env.HOST_BRB_API}/online`,
      timeout: 5000,
      headers: {
        Authorization: `Bearer ${ws.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }).then((res) => {
      //Send(ws.id, { "event": 'users_online', "data": res.data })
    })
  } catch (e) {
    var msg = { error: 401, message: 'Token is invalid or missing' }
    console.warn('\x1b[31m%s\x1b[0m', msg.message)

    Send(ws.id, msg)
    ws.close(1011)
  }
  ws.on('message', (data) => {
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
            url: `http://api.localhost/v2/messages/${recieverId}`, //${process.env.HOST_BRB_API}
            timeout: 5000,
            data: message,
            headers: {
              Authorization: `Bearer ${ws.token}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              Request: json.request ?? null,
              'Parse-mode': ws.params.searchParams.get('Parse-mode') ?? 'html',
            },
          })
            .then(() => {
              console.log(`Sent by id${ws.id} to id${recieverId}`)
            })
            .catch((res) => {
              ws.send(JSON.stringify(res.response.data))
              console.error('\x1b[31m%s\x1b[0m', res.response.data.message)
              ws.close(1011)
            })
        }
      }
      if (json.type === 'message_type') {
        var timeInMs = Date.now()
        //ws.typing.push({ 'user': json.user, 'timestamp': timeInMs})
        Send(json.user, {
          event: 'message_typing',
          data: { timestamp: timeInMs, status: json.status },
        })
      }
    } catch (e) {
      console.error('\x1b[31m%s\x1b[0m', e)
      ws.send(JSON.stringify(e))
    }
  })
  ws.on('error', (error) => {
    console.error(error)
  })
  ws.onclose = (e) => {
    //if (ws.id) users.splice(users.indexOf(ws.id), 1);
    console.log(
      '\x1b[35m%s\x1b[0m',
      `Client ${ws.id ?? ''} has disconnected! [${e.code}]`
    )
  }
})

var app = async () => {
  const connection = mysql.createConnection({
    host: process.env.DB_BRB_SERVER,
    user: process.env.DB_BRB_USERNAME,
    database: process.env.DB_BRB_DATABASE,
    password: process.env.DB_BRB_PASSWORD,
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
    onEvent: (e) => Event(e),
  })

  instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, (err) =>
    error('MySQL disconnected')
  )
  //instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, console.error);
}
function error(err) {
  console.error('\x1b[31m%s\x1b[0m', err)
  process.exit(5)
  /*myInstance.start()
      .then(() => console.log('I\'m running!'))
      .catch(err => console.error('Something bad happened', err))*/
}
app()
  .then(console.log('\x1b[32m%s\x1b[0m', 'Waiting for database events...'))
  .catch((err) => error('MySQL connection error'))
