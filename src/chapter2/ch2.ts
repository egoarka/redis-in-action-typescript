import { Redis as Client } from "ioredis"
import { UserId, Token, Request, RequestHandler } from "./ch2.h"

const delay = (seconds: number) =>
  new Promise(r => setTimeout(r, seconds * 1000))

// fetch and return the given user if available
// (in our case it's just user id)
// and obviously it might be stringified json
const checkToken = async (client: Client, token: Token) =>
  (await client.hget("login:", token)) as UserId

const updateToken = async (
  client: Client,
  token: Token,
  userId: UserId,
  item = ""
) => {
  const now = Date.now().toString()
  // store user info (userId) by token key
  await client.hset("login:", token, userId)
  // user's last activity
  await client.zadd("recent:", now, token)
  if (!item) return
  const sessionToken = `viewed:${token}`
  // user's activity (timestamp:item)
  await client.zadd(sessionToken, now, item)
  // keep most recent 25 items
  await client.zremrangebyrank(sessionToken, 0, -26)
  await client.zincrby("viewed:", -1, item)
}

export class GlobalVars {
  public static QUIT = false
  public static LIMIT = 10 * 1e6
}

// let QUIT = false
// const LIMIT = 10 * 1e6 // most recent 10 mil sessions
const CACHE_REQUEST_EXPIRE_TIME = 300
const ENOUGH_VIEW_COUNT = 10000

const cleanSessions = async (client: Client) => {
  while (!GlobalVars.QUIT) {
    // retrieve count of tokens
    const size = await client.zcard("recent:")
    if (size <= GlobalVars.LIMIT) {
      await delay(1)
      continue
    }

    const endIndex = Math.min(size - GlobalVars.LIMIT, 100)
    const tokens: string[] = await client.zrange("recent:", 0, endIndex - 1)
    const sessionTokens = tokens.map(token => `viewed:${token}`)

    // remove the oldest tokens
    await client.del(...sessionTokens) // users' activities
    await client.hdel("login:", ...tokens) // their info's
    await client.zrem("recent:", ...tokens) // and tokens itself
  }
}

const addToCart = async (
  client: Client,
  token: Token,
  item: string,
  count: number
) => {
  const cartKey = `cart:${token}`
  if (count <= 0) {
    // remove item from the cart
    await client.hdel(cartKey, item)
  } else {
    // add item to the cart
    await client.hset(cartKey, item, count)
  }
}

const cleanFullSessions = async (client: Client) => {
  while (!GlobalVars.QUIT) {
    const size = await client.zcard("recent:")
    if (size <= GlobalVars.LIMIT) {
      await delay(1)
      continue
    }

    const endIndex = Math.min(size - GlobalVars.LIMIT, 100)
    const tokens: string[] = await client.zrange("recent:", 0, endIndex - 1)

    // * flatMap implementation
    // the required added cart token to delete shopping cart old sessions
    const sessionTokens = tokens.reduce<string[]>(
      (acc, token) => acc.concat([`viewed:${token}`, `cart:${token}`]),
      []
    )

    // remove the oldest tokens
    await client.del(...sessionTokens) // users' activities
    await client.hdel("login:", ...tokens) // their info's
    await client.zrem("recent:", ...tokens) // and tokens itself
  }
}

const cacheRequest = async (
  client: Client,
  request: Request,
  callback: RequestHandler
): Promise<string> => {
  if (!canCache(client, request)) {
    // if we cannot cache the request, imediately call the callback
    return callback(request)
  }

  // convert request into a simple string key for later lookups
  // through hashing request
  const pageKey = `cache:${hashRequest(request)}`
  // fetch the cached content, if its available
  let content = await client.get(pageKey)

  if (!content) {
    // generate content if it wasn't cached
    content = callback(request)
    // cache the newly generated content and set expire time
    await client.setex(pageKey, CACHE_REQUEST_EXPIRE_TIME, content)
  }

  return content
}

const scheduleRowCache = async (
  client: Client,
  rowId: string,
  delay: number
) => {
  // set delay for the item
  await client.zadd("delay:", delay.toString(), rowId)
  // schedule the item to be cached now
  // * cacheRows worker can extend the scheduled time
  await client.zadd("schedule:", Date.now().toString(), rowId)
}

// row's name, timestamp
type CacheRow = [string, string]
const cacheRows = async (client: Client) => {
  while (!GlobalVars.QUIT) {
    // find the next row that should be cached (if any),
    // including the timestamp (withscores), as a list of tuples with zero or one items
    // output is ['rowId', 'timestamp', ..., ..., ...]
    // prettier-ignore
    const [rowId, timestamp]: CacheRow = await client.zrange("schedule:", 0, 0, "WITHSCORES")
    const now = Date.now()
    if (!timestamp || parseInt(timestamp) > now) {
      // no rows can be cached now, so wait 50 milliseconds and try again
      await delay(0.05)
      continue
    }

    // get the delay before the next schedule
    const rowDelay = await client.zscore("delay:", rowId).then(parseInt)
    const invKey = `inv:${rowId}`
    if (rowDelay <= 0) {
      // the item shouldn't be cached anymore, remove it from cache
      await client.zrem("delay:", rowId)
      await client.zrem("schedule:", rowId)
      await client.del(invKey)
      continue
    }

    // get the database row
    const row = await Inventory.get(rowId)
    // extend the scheduled time for given row
    await client.zadd("schedule:", (now + rowDelay).toString(), rowId)
    // update cache value
    await client.set(invKey, JSON.stringify(row.data()))
  }
}

// to keep our top list of pages fresh
// we need to trim our list of viewed items, while at the same time
// adjusting the score to allow new items to become popular
const rescaleViewed = async (client: Client) => {
  while (!GlobalVars.QUIT) {
    // remove any item not in the top 20000 viewed items
    await client.zremrangebyrank("viewed:", 20000, -1)
    // rescale all counts to be 1/2 of what they were before
    await client.zinterstore("viewed:", 1, "viewed:", "WEIGHTS", "0.5")
    // do it again in 5 minutes
    await delay(300)
  }
}

const canCache = async (client: Client, request: Request) => {
  // get the item id for the page
  const { itemId } = request.body
  // check whether the page can be statically cached
  // and whether this is an item page
  if (!itemId || isDynamic(request)) {
    return false
  }
  // get the rank of item
  const rank = await client.zrank("viewed:", itemId)
  // return wheter the item has a high enough view count to be cached
  // * cache those pages that are in the top 10,000 product pages
  return rank < ENOUGH_VIEW_COUNT
}

// borrowed from http://mediocredeveloper.com/wp/?p=55
const hash = (str: string): number => {
  const len = str.length

  let hash = 0
  let char
  for (let i = 1; i <= len; i++) {
    char = str.charCodeAt(i - 1)
    hash = (hash << 5) - hash + char
    hash = hash & hash // convert to 32bit integer
  }

  return hash
}

const hashRequest = (request: Request) => {
  return hash(request.url + JSON.stringify(request.body)).toString()
}

const isDynamic = (request: Request) => "dynamic" in request.body

type InventoryData = {
  id: string
  data: number
  cached: number
}

class Inventory {
  private id: string
  constructor(rowId: string) {
    this.id = rowId
  }
  static async get(rowId: string) {
    // emulate some latency
    await delay(0.5)
    return new Inventory(rowId)
  }
  data(): InventoryData {
    return {
      id: this.id,
      data: hash(this.id),
      cached: Date.now()
    }
  }
}

export {
  checkToken,
  updateToken,
  cleanSessions,
  addToCart,
  cleanFullSessions,
  cacheRequest,
  scheduleRowCache,
  cacheRows,
  rescaleViewed,
  canCache,
  hashRequest,
  hash
}
