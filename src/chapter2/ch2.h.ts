type Token = string & { __token: any }
type UserId = string & { __user: any }
interface User {
  id: UserId
  name: string
}
type Request = {
  url: string
  body: {
    itemId?: string
    dynamic?: boolean
    [key: string]: any
  }
}
type RequestHandler = (request: Request) => string

export { Token, UserId, User, Request, RequestHandler }
