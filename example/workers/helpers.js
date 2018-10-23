'use strict'
const argv = require('yargs').argv

async function initMongoDbParams (mc) {
  const collection = 'adminTokens'
  await mc.collection(collection)
    .createIndex({ 'expires_at': 1 }, { expireAfterSeconds: 0 })
  await mc.collection(collection)
    .createIndex({ 'token': 1 }, { unique: true })
}

function initSchedulerExpirationIdCheck (scheduler, worker) {
  const frequency = (argv.test)
    ? '*/1 * * * * *' // For tests run once per second
    : '* * */1 * *' // For production run once a day
  const name = 'expirationIdCheck'
  const check = _checkExpirationId(worker)
  scheduler.add(name, check, frequency)
}

function _checkExpirationId (worker) {
  return () => {
    const wkr = worker
    console.log('Call is performed and can access worker:', wkr)
  }
}

function _checkExpiredDocuments () {
  
}

module.exports = {
  initMongoDbParams,
  initSchedulerExpirationIdCheck
}
