/* eslint-env mocha */

'use strict'

const assert = require('assert')
const {
  notInSchema
} = require('../workers/loc.api/helpers')

describe('kyc testing, helpers', () => {
  it('notInSchema should check if the data belongs to Schema', () => {
    const error = {
      alfjdasfkj: 'passport',
      url: 'http:// fakeUrl',
      filename: 'example.jpg'
    }
    assert.ok(notInSchema(error))

    const valid = {
      type: 'passport',
      url: 'http:// fakeUrl',
      filename: 'example.jpg'
    }
    assert.ok(!notInSchema(valid))
  })
})
