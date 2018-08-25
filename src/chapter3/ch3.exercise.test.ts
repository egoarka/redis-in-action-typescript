import Redis, { Redis as Client } from "ioredis"
import { UserId, Token } from "../chapter2/ch2.h"
import {
  checkToken,
  updateToken,
  cleanSessions,
  GlobalVars,
  getArticles
} from "./ch3.exercise"

import { uuid, delay } from "../utilts"
import { postArticle } from "../chapter1/ch1"

// Exercise: Reducing memory use with LISTs (done)
// Exercise: Removing of race conditions (in progress)
// Exercise: Improving performance (done)
// Exercise: Replacing timestamp ZSETs with EXPIRE (done)

describe("chapter 3 (exercise)", async () => {
  let client: Client

  const userId = "303" as UserId

  beforeAll(async () => {
    client = new Redis({ lazyConnect: true })
    await client.connect()
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

  describe.only("Improving performance", async () => {
    test("Get articles", async () => {
      await postArticle(client, userId, "title 55", "text of 55")
      await postArticle(client, userId, "title 42", "text of 42")

      const result = await getArticles(client, 0)
      expect(result).toMatchObject([
        [
          null,
          expect.objectContaining({
            id: "2",
            title: "title 42"
          })
        ],
        [
          null,
          expect.objectContaining({
            id: "1",
            title: "title 55"
          })
        ]
      ])
    })
  })
})
