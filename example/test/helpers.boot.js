/* eslint-env mocha */
'use strict'

const {
  stopWorkers,
  startWorkers
} = require('./workers')

const configRequest = require('./grenacheClientService.js')

const { bootTwoGrapes, killGrapes } = require('./grapes')

let grapes
function startEnviroment (logs = false) {
  return new Promise((resolve, reject) => {
    let count = 0
    bootTwoGrapes(async (err, g) => {
      if (err) throw err
      const amount = await startWorkers(logs)

      grapes = g
      grapes[0].on('announce', async () => {
        count++
        if (count === amount) {
          try {
            const request = await configRequest('http://127.0.0.1:30001', 'rest:core:kyc')
            const requestCalls = await configRequest('http://127.0.0.1:30001', 'rest:ext:testcalls')
            resolve({ request, requestCalls })
          } catch (e) {
            reject(e)
          }
        }
      })
    })
  })
}

function stopEnviroment (done) {
  stopWorkers().then(() => {
    killGrapes(grapes, done)
  }, (e) => {
    done(e)
  })
}

module.exports = {
  startEnviroment,
  stopEnviroment
}
