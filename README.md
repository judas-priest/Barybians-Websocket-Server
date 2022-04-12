# Websocket Server API for Barybians social networking site

## Usage

### Build

    npm install

#### Run

    node ws.js

#### Connect

    ws://localhost:3000

### Authorization

Get a token from Barybians REST API

#### Pass cookies "token"

    token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c

#### Or GET parameter "token"

    ws://localhost:3000?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c

### Events

#### Message sent

```javascript
{
  "event": "message_sended",
  "data": {
    "id": 6286,
    "senderId": 1,
    "receiverId": 21,
    "text": "joker 7",
    "utime": 1649756840,
    "unread": 1,
    "attachments": [
      {
        "url": "http://content.brb.lan/stickers/joker/7.png",
        "pack": "joker",
        "type": "sticker",
        "length": 7,
        "offset": 0,
        "sticker": 7
      }
    ]
  }
}
```

#### Message read

```javascript
{
  "event": "message_readed",
  "data": {
    "id": 6286,
    "senderId": 1,
    "receiverId": 21,
    "text": "joker 7",
    "utime": 1649756840,
    "unread": 0,
    "attachments": [
      {
        "url": "http://content.brb.lan/stickers/joker/7.png",
        "pack": "joker",
        "type": "sticker",
        "length": 7,
        "offset": 0,
        "sticker": 7
      }
    ]
  }
}
```

### Actions

#### Send a message

```javascript
{
  "type": "message_send",
  "user": "21",
  "text": "<sticker pack=\"joker\">7</sticker>",
  "request": "520d32ac-e2f7-47f5-a657-451473013c22"
}
```
