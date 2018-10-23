'use strict'

const createWorker = require('../../stub-spies-helpers/worker.js')
const argv = require('yargs').argv

const name = argv.mockspy
const { workerArgs } = require(`../../mocks-spies/${name}.js`)

const WrkExtMockspyApi = createWorker(...workerArgs)

module.exports = WrkExtMockspyApi
