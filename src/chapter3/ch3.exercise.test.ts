import Redis, { Redis as Client } from "ioredis"
import { UserId, Token } from "../chapter2/ch2.h"
import {
  checkToken,
  updateToken,
  cleanSessions,
  GlobalVars
} from "./ch3.exercise"

import { uuid, delay } from "../utilts"

describe("chapter 3 (exercise)", async () => {
  let client: Client

  const userId = "303" as UserId

  beforeAll(async () => {
    client = new Redis()
    await client.flushall()
  })

  afterAll(async () => {
    await client.flushall()
    await client.quit()
  })

  describe("Login", async () => {
    const token = uuid() as Token
    const sessionToken = `viewed:${token}`
    const now = Date.now()

    test("Cookies", async () => {
      await updateToken(client, token, userId, "itemC")

      const result = await checkToken(client, token)
      expect(result).toBe(userId)

      const lastActivity = await client.lrange("recent:", 0, -1)
      expect(lastActivity).toEqual([token])

      const lastUserActivity = await client.lrange(sessionToken, 0, -1)
      expect(lastUserActivity).toEqual(["itemC"])

      // ... user's activity
      // ... most resent 25 items
    })

    test("Drop the maximum number of cookies to 0 to clean them out", async () => {
      let loginCount = await client.hlen("login:")
      let recentCount = await client.llen("recent:")
      let viewedCount = await client.llen(sessionToken)
      expect(loginCount).toBe(1)
      expect(recentCount).toBe(1)
      expect(viewedCount).toBe(1)

      GlobalVars.QUIT = false
      GlobalVars.LIMIT = 0
      delay(2).then(_ => {
        GlobalVars.QUIT = true
      })

      await cleanSessions(client)
      loginCount = await client.hlen("login:")
      recentCount = await client.llen("recent:")
      viewedCount = await client.llen(sessionToken)
      expect(loginCount).toBe(0)
      // left only one
      // ltrim 0 endIndex - 1 -> ltrim 0 0
      expect(recentCount).toBe(1)
      expect(viewedCount).toBe(0)
    })
  })
})
