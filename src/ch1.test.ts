import Redis from "ioredis"
import { UserId, Article } from "./ch1"
import {
  voteArticle,
  postArticle,
  getArticles,
  addGroups,
  getGroupArticles
} from "./ch1"

async function start() {
  const client = new Redis()
  await client.flushall()

  /* below is test code part */
  const userId = "1" as UserId
  const articleId = await postArticle(
    client,
    userId,
    "article title",
    "some text"
  )
  const articleKey = `article:${articleId}`
  console.log("We posted a new article with id:", articleId)
  // assert(typeof articleId === 'string')

  const article: Article = await client.hgetall(articleKey)
  console.log("It's HASH looks like: ")
  console.log(article)
  // assert(article.title === "article title")

  await voteArticle(client, userId, articleId)
  const votes = await client.hget(articleKey, "votes")
  console.log("We voted for the article, it now has votes:", votes)
  // assert(votes === 1)

  const articles = await getArticles(client, 1)
  console.log("The currently highest-scoring articles are:")
  console.log(articles)
  // assert(articles.length === 1)

  {
    await addGroups(client, articleId, ["music"])
    const articles = await getGroupArticles(client, 1, "score", "music")
    console.log(
      "We added the article to a music group, other articles include:"
    )
    console.log(articles)
    // assert(articles.length === 1)
  }

  console.log("chapter 1: test has been passed")
}

export { start }
