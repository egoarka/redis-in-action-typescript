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

export { UserId, User }
export { ArticleId, Article }
