# PC Remote — WebSocket Protocol v1

Low-latency control channel at `ws://<pc>:<port>/ws?token=<session>`.
If the token is missing/invalid, the client must send `{v:1, type:'auth', token}`
as its first message within 10 seconds or the server closes the socket.

Every message is a JSON object with `v: 1`. Malformed messages receive
`{v:1, type:'error', code, message, for}` and the socket stays alive.
More than 150 messages/second closes the socket (flood protection).

## Client → Server

| type | fields | effect |
|---|---|---|
| `auth` | `token` | authenticate an unauthenticated socket |
| `ping` | `t` | server replies `pong` (latency measurement) |
| `mouse_move` | `dx`, `dy` | relative move, pixels |
| `mouse_abs` | `nx`, `ny` | absolute move, normalized 0..1 |
| `mouse_click` | `button`: left\|right\|middle | click |
| `mouse_dblclick` | — | double left-click |
| `mouse_down` / `mouse_up` | `button` | press/release (drag) |
| `scroll` | `dx`, `dy` | scroll wheel |
| `key` | `key`, `action`: press\|down\|up | special key (see key names) |
| `type_text` | `text` (max 2000 chars) | type text |
| `shortcut` | `keys`: 1–4 key names | press+release chord |
| `screen_start` | `quality`: low\|balanced\|high\|ultra | begin JPEG frame stream |
| `screen_stop` | — | stop the stream |

## Server → Client

| type | fields |
|---|---|
| `ready` | `capabilities`: `{screen, input, platform}` |
| `pong` | `t` (echoed) |
| `frame` | `data`: base64 JPEG |
| `ok` | `for`: acknowledged message type |
| `error` | `code`, `message`, `for?` |

## Key names

`ESC TAB ENTER BACKSPACE DELETE SPACE HOME END PAGEUP PAGEDOWN`
`UP DOWN LEFT RIGHT INSERT PRINTSCREEN`
`CTRL ALT SHIFT WIN MENU`
`F1`…`F24`, or any single printable character.
Media/volume: `VOL_UP VOL_DOWN VOL_MUTE MEDIA_PLAY_PAUSE MEDIA_NEXT MEDIA_PREV MEDIA_STOP`.

## Quality presets

| preset | JPEG quality | target fps |
|---|---|---|
| low | 40 | 5 |
| balanced | 60 | 10 |
| high | 75 | 15 |
| ultra | 90 | 20 |

Frames are captured on a non-overlapping timer: if a capture is slow,
the next one is scheduled immediately after instead of piling up.
