import Redis, { Redis as Client } from "ioredis"
import { UserId, Article, ArticleId } from "./ch1.h"
import { voteArticle, postArticle } from "./ch1.exercise"

describe("chapter 1 (exercise)", async () => {
  let client: Client

  const userId = "1" as UserId
  const userKey = `user:${userId}`

  let articleId: ArticleId
  let articleKey: string
  let articleTime: number

  beforeAll(async () => {
    client = new Redis()
    await client.flushall()
  })

  afterAll(async () => {
    await client.flushall()
    await client.quit()
  })

  test("Post new article", async () => {
    articleId = await postArticle(client, userId, "article title", "some text")
    articleKey = `article:${articleId}`
    articleTime = await client.hget(articleKey, "time").then(parseInt)
    expect(articleId).toBe("1")
  })

  for (let _ in [1, 2]) {
    test("Upvote for the article", async () => {
      await voteArticle(client, userId, articleId, "up")
      const votes = await client.hget(articleKey, "votes").then(parseInt)
      const score = await client.zscore("score:", articleKey).then(parseInt)
      const isUpMember = await client
        .sismember(`upvoted:${articleId}`, userKey)
        .then(Boolean)
      const isDownMember = await client
        .sismember(`downvoted:${articleId}`, userKey)
        .then(Boolean)
      expect(votes).toBe(1)
      expect(isUpMember).toBe(true)
      expect(isDownMember).toBe(false)
      expect(score - articleTime).toBe(432)
    })
  }

  for (let _ in [1, 2]) {
    test("Downvote for the upvoted article", async () => {
      await voteArticle(client, userId, articleId, "down")
      const votes = await client.hget(articleKey, "votes").then(parseInt)
      const score = await client.zscore("score:", articleKey).then(parseInt)
      const isUpMember = await client
        .sismember(`upvoted:${articleId}`, userKey)
        .then(Boolean)
      const isDownMember = await client
        .sismember(`downvoted:${articleId}`, userKey)
        .then(Boolean)
      expect(votes).toBe(1)
      expect(isUpMember).toBe(false)
      expect(isDownMember).toBe(true)
      expect(score - articleTime).toBe(-432)
    })
  }
})
