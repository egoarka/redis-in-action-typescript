import { Redis as Client } from "ioredis"
import { UserId, Token, Request, RequestHandler } from "../chapter2/ch2.h"
import { delay } from "../utilts"
import { ArticleId } from "../chapter1/ch1.h"

const ONE_WEEK_IN_SECONDS = 7 * 86400
const VOTE_SCORE = 432
const ARTICLES_PER_PAGE = 25
const GROUP_ARTICLES_EXPIRE_TIME = 1

const checkToken = async (client: Client, token: Token) =>
  (await client.hget("login:", token)) as UserId

type Order = "score" | "time"
type Group = "music" | "programming" | ""
const getArticles = async (
  client: Client,
  page: number,
  order: Order = "score",
  group: Group = ""
) => {
  const orderKey = `${order}:${group}`
  const start = Math.max(page - 1, 0) * (ARTICLES_PER_PAGE - 1)
  const end = start + (ARTICLES_PER_PAGE - 1)

  const ids: ArticleId[] = await client.zrevrange(orderKey, start, end)
  const pipeline = await client.pipeline()
  ids.forEach(id => pipeline.hgetall(id))
  return await pipeline.exec()
}

const updateToken = async (
  client: Client,
  token: Token,
  userId: UserId,
  item = ""
) => {
  // const now = Date.now().toString()
  // store user info (userId) by token key
  await client.hset("login:", token, userId)

  await client.lpush("recent:", token)
  if (!item) return
  const sessionToken = `viewed:${token}`

  await client.lpush(sessionToken, item)
  await client.ltrim(sessionToken, 0, 24)

  await client.zincrby("viewed:", -1, item)
}

export class GlobalVars {
  public static QUIT = false
  public static LIMIT = 10 * 1e6
}

const cleanSessions = async (client: Client) => {
  while (!GlobalVars.QUIT) {
    // retrieve count of tokens
    const size = await client.llen("recent:")
    if (size <= GlobalVars.LIMIT) {
      await delay(1)
      continue
    }

    const endIndex = Math.min(size - GlobalVars.LIMIT, 100)
    const tokens: string[] = await client.lrange("recent:", endIndex - 1, -1)
    const sessionTokens = tokens.map(token => `viewed:${token}`)
    // remove the oldest tokens
    await client.del(...sessionTokens) // users' activities
    await client.hdel("login:", ...tokens) // their info's
    await client.ltrim("recent:", 0, endIndex - 1) // and tokens itself
  }
}

// store login token as string
const checkToken2 = async (client: Client, token: Token) =>
  (await client.get(`login:${token}`)) as UserId

// Replacing timestamp ZSETs with EXPIRE
const updateToken2 = async (
  client: Client,
  token: Token,
  userId: UserId,
  item = ""
) => {
  const tokenKey = `login:${token}`
  await client.setex(tokenKey, ONE_WEEK_IN_SECONDS, userId)

  if (!item) return
  const sessionToken = `viewed:${token}`
  await client
    .pipeline()
    .lpush(sessionToken, item)
    .ltrim(sessionToken, 0, 24)
    .zincrby("viewed:", -1, item)
    .expire(sessionToken, ONE_WEEK_IN_SECONDS)
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
  await client.expire(cartKey, ONE_WEEK_IN_SECONDS)
}

export {
  checkToken,
  getArticles,
  updateToken,
  updateToken2,
  checkToken2,
  cleanSessions
}
