const { startHelpers } = require('../workers')

const { bootTwoGrapes } = require('../grapes')

let count = 0
console.log('Wait till ready')
bootTwoGrapes((err, g) => {
  if (err) throw err
  startHelpers(true)
  const grapes = g
  grapes[0].on('announce', async () => {
    count++
    if (count === 3) {
      try {
        console.log('Ready!!')
      } catch (e) {
        console.log('Error: ', e.toString())
      }
    }
  })
})
