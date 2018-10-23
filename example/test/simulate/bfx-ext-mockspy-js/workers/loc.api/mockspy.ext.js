'use strict'

const createApi = require('../../../stub-spies-helpers/api.js')
const argv = require('yargs').argv

const name = argv.mockspy
const { addFunctions } = require(`../../../mocks-spies/${name}.js`)

const ExtApiComplete = createApi(addFunctions)

module.exports = ExtApiComplete
