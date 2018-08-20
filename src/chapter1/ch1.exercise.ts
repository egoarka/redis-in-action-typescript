import { Redis as Client } from "ioredis"
import { UserId, ArticleId, Article } from "./ch1.h"

const ONE_WEEK_IN_SECONDS = 7 * 86400
const VOTE_SCORE = 432
const ARTICLES_PER_PAGE = 25
const GROUP_ARTICLES_EXPIRE_TIME = 1

type Reaction = "up" | "down"
const voteArticle = async (
  client: Client,
  userId: UserId,
  articleId: ArticleId,
  reaction: Reaction
) => {
  const userKey = `user:${userId}`
  const articleKey = `article:${articleId}`
  const articleVotedKey = `${reaction}voted:${articleId}`
  const voteMultiplier = reaction === "up" ? 1 : -1

  const cutoff = Date.now() - ONE_WEEK_IN_SECONDS
  const time = await client.zscore("time:", articleKey).then(parseFloat)

  // if week has passed then ignore this article
  if (time < cutoff) {
    return
  }

  const isVotedUp = await client.sismember(`upvoted:${articleId}`, userKey)
  const isVotedDown = await client.sismember(`downvoted:${articleId}`, userKey)
  const isVoted = isVotedUp || isVotedDown

  if (!isVoted) {
    await client.sadd(articleVotedKey, userKey)

    await client.zincrby("score:", VOTE_SCORE * voteMultiplier, articleKey)
    await client.hincrby(articleKey, "votes", 1)
  } else {
    // if we want to vote down but recently voted up and vice versa
    const source = isVotedUp ? "up" : "down"
    const destionation = isVotedUp ? "down" : "up"

    if (source === reaction) {
      return
    }

    // change vote location due to another vote reaction
    await client.smove(
      `${source}voted:${articleId}`,
      `${destionation}voted:${articleId}`,
      userKey
    )

    await client.zincrby("score:", VOTE_SCORE * 2 * voteMultiplier, articleKey)
  }
}

const postArticle = async (
  client: Client,
  userId: UserId,
  title: string,
  text: string
): Promise<ArticleId> => {
  // generate a new article id
  const articleId = await client
    .incr("article:")
    .then(id => id.toString() as ArticleId)

  const userKey = `user:${userId}`
  const articleKey = `article:${articleId}`

  for (let reaction of ["up", "down"]) {
    const articleVotedKey = `${reaction}voted:${articleId}`
    await client.expire(articleVotedKey, ONE_WEEK_IN_SECONDS)
  }

  // start with the posting user having voted for the article
  // await client.sadd(articleVotedKey, userKey)

  // date of creating article
  const time = Date.now()
  // article payload
  const article: Article = {
    id: articleId,
    title,
    text,
    user: userId,
    time,
    votes: 0
  }

  // create the article entity
  await client.hmset(articleKey, article)

  // add article to the time and score ordered ZSETs
  // await client.zadd("score:", (time + VOTE_SCORE).toString(), articleKey)
  await client.zadd("score:", time.toString(), articleKey)
  await client.zadd("time:", time.toString(), articleKey)

  return articleId
}

export { voteArticle, postArticle }
