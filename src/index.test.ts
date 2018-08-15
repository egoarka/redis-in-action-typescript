import * as chapter1 from "./ch1.test"

async function start() {
  await chapter1.start()
}

start().catch(console.log)
