import Redis, { Redis as Client } from "ioredis"
import { UserId, Token, RequestHandler, Request, Cart } from "./ch2.h"

import {
  updateToken,
  checkToken,
  cleanSessions,
  GlobalVars,
  addToCart,
  cleanFullSessions,
  cacheRequest,
  canCache,
  hashRequest,
  scheduleRowCache,
  cacheRows,
  hash
} from "./ch2"

import { uuid, delay } from "../utilts"

describe("chapter 2", async () => {
  let client: Client

  const userId = "909" as UserId

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
    const now = Date.now()

    test("Cookies", async () => {
      await updateToken(client, token, userId, "itemX")

      const result = await checkToken(client, token)
      expect(result).toBe(userId)

      const lastActivity = await client.zscore("recent:", token).then(parseInt)
      expect(lastActivity - now).toBeGreaterThanOrEqual(0)

      // ... user's activity
      // ... most resent 25 items
    })

    test("Drop the maximum number of cookies to 0 to clean them out", async () => {
      let loginCount = await client.hlen("login:")
      expect(loginCount).toBe(1)

      GlobalVars.QUIT = false
      GlobalVars.LIMIT = 0
      delay(2).then(_ => {
        GlobalVars.QUIT = true
      })

      await cleanSessions(client)
      loginCount = await client.hlen("login:")
      expect(loginCount).toBe(0)
    })
  })

  describe("Shopping cart", async () => {
    const token = uuid() as Token
    const cartKey = `cart:${token}`

    test("Cookies", async () => {
      // refresh our session
      await updateToken(client, token, userId, "itemX")
      // add an item to the shopping cart
      await addToCart(client, token, "itemY", 3)
      await addToCart(client, token, "itemZ", 6)

      const cart: Cart = await client.hgetall(cartKey)
      expect(cart).toStrictEqual({
        itemY: "3",
        itemZ: "6"
      })
    })

    test("Clear out sessions and carts", async () => {
      let loginCount = await client.hlen("login:")
      let cartCount = await client
        .hgetall(cartKey)
        .then((cart: Cart) => Object.keys(cart).length)
      expect(loginCount).toBe(1)
      expect(cartCount).toBe(2)

      GlobalVars.QUIT = false
      GlobalVars.LIMIT = 0
      delay(2).then(_ => {
        GlobalVars.QUIT = true
      })

      await cleanFullSessions(client)
      loginCount = await client.hlen("login:")
      cartCount = await client
        .hgetall(cartKey)
        .then((cart: Cart) => Object.keys(cart).length)
      expect(loginCount).toBe(0)
      expect(cartCount).toBe(0)

      // ... user's activity
      // ... most resent 25 items
    })
  })

  describe("Cache", async () => {
    const token = uuid() as Token
    const request: Request = {
      url: "http://test.com/",
      body: {
        itemId: "itemB",
        ts: Date.now().toString()
      }
    }

    const dynamicRequest: Request = {
      url: "http://test.com/",
      body: {
        dynamic: true,
        ts: Date.now().toString()
      }
    }

    const callback: RequestHandler = request =>
      `<div>${request.body.itemId}</div>`
    const callbackBad: RequestHandler = request => "<div>bad</div>"
    const expectedRequest = "<div>itemB</div>"

    test(`Request (cache a simple request)
        payload: ${JSON.stringify(request)}
      `, async () => {
      await updateToken(client, token, userId, "itemB")

      const isCaching = await canCache(client, request)
      expect(isCaching).toBe(true)

      const result = await cacheRequest(client, request, callback)
      const pageKey = `cache:${hashRequest(request)}`
      const result2 = await client.get(pageKey)
      expect(result).toBe(expectedRequest)
      expect(result2).toBe(expectedRequest)

      // to test that we've cached the request, we'll pass a bad callback
      const result3 = await cacheRequest(client, request, callbackBad)
      expect(result3).toBe(expectedRequest)

      const isDynamicCaching = await canCache(client, dynamicRequest)
      expect(isDynamicCaching).toBe(false)
    })

    test("Rows", async () => {
      // first, let's schedule caching of itemR every 2 seconds
      await scheduleRowCache(client, "itemR", 2)
      // output is ['rowId', 'timestamp', ..., ..., ...]
      // prettier-ignore
      const [rowId, timestamp] = await client.zrange('schedule:', 0, -1, 'WITHSCORES')
      expect(rowId).toBe("itemR")

      const concurrent = async () => {
        GlobalVars.QUIT = false

        await delay(1)
        const invKey = `inv:itemR`
        const result = await client.get(invKey).then(JSON.parse)
        expect(result).toMatchObject({
          id: rowId,
          data: hash(rowId),
          cached: expect.any(Number)
        })

        // We'll check again in 2 seconds
        await delay(2)
        // notice that the data has changed
        const result2 = await client.get(invKey).then(JSON.parse)
        expect(result.cached).not.toBe(result2.cached)

        // let's force un-caching
        await scheduleRowCache(client, "itemR", -1)
        await delay(1)
        const result3 = await client.get(invKey).then(JSON.parse)
        expect(result3).toBe(null)

        GlobalVars.QUIT = true
      }

      concurrent()
      // we'll start a caching promise that will cache the data
      await cacheRows(client)
    })
  })
})
