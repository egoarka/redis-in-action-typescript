import { delay } from "../utilts"
import Redis from "ioredis"

// Publish/subscribe
// https://github.com/josiahcarlson/redis-in-action/blob/6c7badec1505934bbe2dabb37aabb342d9e21972/python/ch03_listing_source.py#L308

const client = new Redis({ lazyConnect: true })
const pub = new Redis({ lazyConnect: true })
let count = 0

client.on("message", async (channel, message) => {
  ++count
  console.log("Receive message %s from channel: %s", message, channel)
  if (count === 3) {
    await client.unsubscribe("channel")
  }
})

const range = (n: number) => [...new Array(n)].fill(0).map((_, i) => i + 1)

const publisher = async (n: number) => {
  await delay(1)
  for (let i of range(n)) {
    await pub.publish("channel", i.toString())
    await delay(1)
  }
}

const startPubSub = async () => {
  await client.connect()
  await pub.connect()

  await client.subscribe("channel")

  await publisher(4)

  await client.disconnect()
  await pub.disconnect()
}

// startPubSub()
// Receive message 1 from channel: channel
// Receive message 2 from channel: channel
// Receive message 3 from channel: channel
// 4-th is ignored (because of unsubscribe)

/* - - - - - */

// Basic Redis transactions

// Without transaction
// https://github.com/josiahcarlson/redis-in-action/blob/6c7badec1505934bbe2dabb37aabb342d9e21972/python/ch03_listing_source.py#L417

const notrans = async () => {
  await client.incr("notrans:").then(console.log)
  await delay(0.1)
  await client.incrby("notrans:", -1)
}

const startNotrans = async () => {
  await client.connect()
  await Promise.all([notrans(), notrans(), notrans()])
  await client.disconnect()
}

// startNotrans()
// 1
// 2
// 3

/* - - - - - */

// With transaction
// https://github.com/josiahcarlson/redis-in-action/blob/6c7badec1505934bbe2dabb37aabb342d9e21972/python/ch03_listing_source.py#L442

// either

const trans = async () => {
  const pipeline = await client.pipeline()
  pipeline.incr("trans:")
  await delay(0.1)
  pipeline.incrby("trans:", -1)
  await pipeline.exec().then(([[, i]]) => console.log(i))
}

// or

const trans2 = () =>
  client
    .pipeline()
    .incr("trans:")
    .incrby("trans:", -1)
    .exec()
    .then(([[, i]]) => console.log(i))

const startTrans = async () => {
  await client.connect()
  await Promise.all([trans(), trans(), trans()])
  // await Promise.all([trans2(), trans2(), trans2()])
  await client.disconnect()
}

// startTrans()
// 1
// 1
// 1
