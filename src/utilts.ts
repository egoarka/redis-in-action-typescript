const delay = (seconds: number) =>
  new Promise(r => setTimeout(r, seconds * 1000))

const uuid = () =>
  [...new Array(32)]
    .fill(0)
    .map(_ => ((Math.random() * 16) | 0).toString(16))
    .join("")

export { delay, uuid }
