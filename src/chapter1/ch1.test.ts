import Redis, { Redis as Client } from "ioredis"
import { UserId, Article, ArticleId } from "./ch1.h"
import {
  voteArticle,
  postArticle,
  getArticles,
  addGroups,
  getGroupArticles,
  removeGroups
} from "./ch1"

const delay = (seconds: number) =>
  new Promise(r => setTimeout(r, seconds * 1000))

describe("chapter 1", async () => {
  let client: Client

  const userId = "1" as UserId

  let articleId: ArticleId
  let articleKey: string

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
    expect(articleId).toBe("1")
  })

  test("Get article HASH", async () => {
    const article: Article = await client.hgetall(articleKey)
    expect(article).toMatchObject({
      id: "1",
      user: "1",
      title: "article title"
    })
  })

  test("Vote for the article", async () => {
    await voteArticle(client, userId, articleId)
    const votes = await client.hget(articleKey, "votes").then(parseInt)
    expect(votes).toBe(1)
  })

  test("Get the currently highest-scoring articles", async () => {
    const articles = await getArticles(client, 1)
    expect(articles.length).toBe(1)
  })

  test(`Add article to music group`, async () => {
    await addGroups(client, articleId, ["music"])
    const articles = await getGroupArticles(client, 1, "score", "music")
    expect(articles.length).toBe(1)
  })

  test("Expect no articles haven't added to programming group", async () => {
    const articles = await getGroupArticles(client, 1, "score", "programming")
    expect(articles.length).toBe(0)
  })

  test("Remove article from a music group", async () => {
    await removeGroups(client, articleId, ["music"])
    await delay(1.5) // delay to wait till expire group
    const articles = await getGroupArticles(client, 1, "score", "music")
    expect(articles.length).toBe(0)
  })
})
