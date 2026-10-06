# Relay Load Test (150+ players)

तांबोला relay par **150 से ज़्यादा खिलाड़ियों** का load test.

## क्यों
ऐप Cloudflare WebSocket relay (`jain-tambola-relay`) use karta hai — PeerJS ki ~50 wali seema hatane ke liye. Ye script asli relay par 1 host + N players jod kar naapta hai:
- kitne connect hue / fail hue
- connect time (avg, p95, max)
- ek broadcast (शब्द) kitne players tak pahuncha
- delivery latency (avg, p50, p95, max)

## चलाने का तरीका
पहले `ws` package chahiye:

    npm i ws

**1) असली relay par (internet चाहिए):**

    node relay-loadtest.mjs --url wss://jain-tambola-relay.betu473.workers.dev --players 150

**2) Offline mock पर (बिना internet — सिर्फ़ script/प्रोटोकॉल जाँचने के लिए):**

    node relay-loadtest.mjs --mock --players 150

### Options
| flag | default | matlab |
|------|---------|--------|
| `--players N` | 150 | kitne players |
| `--room CODE` | LTEST1 | room code |
| `--url URL` | live relay | relay address |
| `--window MS` | 8000 | broadcast sunne ka waqt |
| `--mock` | off | local mock relay |

## Result kaise padhein
- **delivery 100%** hona chahiye (ya ≥ 99%).
- **p95 latency** kam honi chahiye (asli relay par aam taur par 100–400ms).
- Exit code 0 = PASS, 2 = CHECK (kuch players tak message nahi pahuncha).

## नोट
- Script jaan-boojh kar **plain Node** mein hai — koi bhaari framework nahi.
- Asli relay par chalane ke liye us machine par **public internet** chahiye (kuch restricted sandbox/office networks relay tak nahi jaate).
