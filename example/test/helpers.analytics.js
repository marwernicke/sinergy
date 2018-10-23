/* eslint-env mocha */
'use strict'

const ObjectID = require('mongodb').ObjectID
const {
  dbAddQuery
} = require('./workers')

const analyticsAddQuery = (params) => {
  const {
    actor,
    status,
    uid,
    notes = 'some note',
    worth = 1000,
    timestamp = new Date().getTime()
  } = params
  if (!(actor && status && uid)) {
    throw new Error('PARAM_MISSING')
  }
  const update = {
    actor,
    status,
    uid,
    notes,
    date: new Date(timestamp),
    net_worth_usd: worth,
    timestamp
  }
  const check = { _id: ObjectID() }
  return dbAddQuery('statusLogs', check, update)
}

const populateDatabaseForTests = async () => {
  await completed(1, 'adm1', 0)
  await completed(2, 'adm1', 0)
  await completed(3, 'adm1', 0)
  await completed(4, 'adm1', 0)
  // average 0 and 1000
  await completed(5, 'adm2', 55, 300)
  await completed(6, 'adm2', 20, 200)
  await completed(7, 'adm2', 60, 1500)
  await completed(8, 'adm2', 30, 400)
  await completed(9, 'adm2', 90, 10)
  // Average days
}

const populateDatabaseForNoiseTests = async () => {
  await completed(1, 'adm1', 1, 10)
  await completed(2, 'adm1', 1, 10)
  await completed(3, 'adm1', 100000, 10000000)
  await completed(4, 'adm1', 100000, 10000000)
  for (let i = 5; i <= 100; i++) {
    await completed(i, 'adm3', 2, 500)
  }
}

const completed = async (uid = 1, adm = 'adm1', daysDiff = 1, worth = 1000) => {
  const dayMili = 24 * 60 * 60 * 1000
  const verifiedD = new Date().getTime()
  const submittedD = verifiedD - daysDiff * dayMili
  const incompleteD = submittedD - daysDiff * dayMili
  await analyticsAddQuery({
    actor: 'user',
    status: 'incomplete',
    uid,
    worth,
    timestamp: incompleteD
  })
  await analyticsAddQuery({
    actor: `${adm}@bitfinex.com`,
    status: 'submitted',
    uid,
    worth,
    timestamp: submittedD
  })
  await analyticsAddQuery({
    actor: `${adm}@bitfinex.com`,
    status: 'verified',
    uid,
    worth,
    timestamp: verifiedD
  })
}

module.exports = {
  populateDatabaseForTests,
  populateDatabaseForNoiseTests
}
