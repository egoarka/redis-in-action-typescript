import { Redis as Client } from "ioredis"

type UserId = string & { __user: any }
interface User {
  id: UserId
  name: string
}

type ArticleId = string & { __article: any }
interface Article {
  id: ArticleId
  user: UserId
  title: string
  text: string

  time: number
  votes: number
}

const ONE_WEEK_IN_SECONDS = 7 * 86400
const VOTE_SCORE = 432
const ARTICLES_PER_PAGE = 25
const GROUP_ARTICLES_EXPIRE_TIME = 60

// if the user hasn't voted for this article before,
// increment the article score and vote count
const voteArticle = async function(
  client: Client,
  userId: UserId,
  articleId: ArticleId
) {
  const userKey = `user:${userId}`
  const articleKey = `article:${articleId}`
  const articleVotedKey = `voted:${articleId}`

  const cutoff = Date.now() - ONE_WEEK_IN_SECONDS
  const time = await client.zscore("time:", articleKey).then(parseFloat)

  // if week has passed then ignore this article
  if (time < cutoff) {
    return
  }

  // vote to article
  // if already voted return zero
  if (!(await client.sadd(articleVotedKey, userKey))) {
    return
  }

  await client.zincrby("score:", VOTE_SCORE, articleKey)
  await client.hincrby(articleKey, "votes", 1)
}

const postArticle = async function(
  client: Client,
  userId: UserId,
  title: string,
  text: string
): Promise<ArticleId> {
  // generate a new article id
  const articleId = await client
    .incr("article:")
    .then(id => id.toString() as ArticleId)

  const userKey = `user:${userId}`
  const articleKey = `article:${articleId}`
  const articleVotedKey = `voted:${articleId}`

  // start with the posting user having voted for the article

  await client.sadd(articleVotedKey, userKey)
  await client.expire(articleVotedKey, ONE_WEEK_IN_SECONDS)

  // date of creating article
  const time = Date.now()
  // article payload
  const article: Article = {
    id: articleId,
    title,
    text,
    user: userId,
    time,
    votes: 1
  }

  // create the article entity
  await client.hmset(articleKey, article)

  // add article to the time and score ordered ZSETs
  await client.zadd("score:", (time + VOTE_SCORE).toString(), articleKey)
  await client.zadd("time:", time.toString(), articleKey)

  return articleId
}

type Order = "score" | "time"
const getArticles = async function(
  client: Client,
  page: number,
  order: Order = "score",
  group: Group = ""
) {
  const orderKey = `${order}:${group}`
  const start = (page - 1) * (ARTICLES_PER_PAGE - 1)
  const end = start + (ARTICLES_PER_PAGE - 1)

  const ids: ArticleId[] = await client.zrevrange(orderKey, start, end)
  const articles = []
  for (let id of ids) {
    const article: Article = await client.hgetall(id)
    articles.push(article)
  }

  return articles
}

type Group = "music" | "programming" | ""
// add the article to group that it should be part of
const addGroups = async function(
  client: Client,
  articleId: ArticleId,
  groups: Group[] = []
) {
  const articleKey = `article:${articleId}`
  for (let group of groups) {
    const groupKey = `group:${group}`
    await client.sadd(groupKey, articleKey)
  }
}

// remove the article from group that it should be removed from
const removeGroups = async function(
  client: Client,
  articleId: ArticleId,
  groups: Group[] = []
) {
  const articleKey = `article:${articleId}`
  for (let group of groups) {
    const groupKey = `group:${group}`
    await client.srem(groupKey, articleKey)
  }
}

const getGroupArticles = async function(
  client: Client,
  page: number,
  order: Order = "score",
  group: Group
) {
  const orderGroupKey = `${order}:${group}`
  const groupKey = `group:${group}`
  const orderKey = `${order}:`
  if (!(await client.exists(orderGroupKey))) {
    await client.zinterstore(orderGroupKey, 2, groupKey, orderKey)
    await client.expire(orderGroupKey, GROUP_ARTICLES_EXPIRE_TIME)
  }
  return getArticles(client, page, order)
}

export { UserId, User }
export { ArticleId, Article }
export { voteArticle, postArticle, getArticles, addGroups, getGroupArticles }
