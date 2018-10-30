/* eslint-env mocha */
'use strict'
const finder = require('../finder')
const { fetchStart, fetchEnd } = require('../index')
const assert = require('assert')

describe('Prueba de bd', () => {
  it('Function leerDb should return the db data requested in an array ', async () => {
    const data = await finder.leerDb()
    assert.ok(data)
  })
  it('Function fetch should return the trades requested in an array ', async () => {
    const data = await finder.fetchTrades()
    assert.ok(data)
  })
  it(`Function fetch should return the trades between ${new Date(fetchStart)} and ${new Date(fetchEnd)} `, async () => {
    const data = await finder.fetchTrades()
    assert.ok(data[0].date.getTime() >= fetchStart)
  })
})
// 1540263600000
