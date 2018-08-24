import Redis from "ioredis"
// Exercise: Removing of race conditions

import { postArticle } from "../chapter1/ch1"
import { voteArticle } from "../chapter3/ch3.exercise"

import { UserId, ArticleId } from "../chapter1/ch1.h"
import { delay } from "../utilts"

const client = new Redis({ lazyConnect: true })
const posterId = "909" as UserId
const users = [...new Array(5)]
  .fill(" ")
  .map((_, i) => (i + 1).toString()) as UserId[]
let articleId: ArticleId

const start = async () => {
  await client.connect()
  await client.flushall()
  articleId = await postArticle(client, posterId, "article1", "lorem1")
  await delay(0.5)
  for (let userId of users) {
    // without blocking
    voteArticle(client, userId, articleId)
  }

  console.log("ok")
  // await client.disconnect()
}

start()
