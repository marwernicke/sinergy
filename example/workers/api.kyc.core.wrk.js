'use strict'

const { WrkApi } = require('bfx-wrk-api')
const argv = require('yargs').argv
const {
  initMongoDbParams,
  initSchedulerExpirationIdCheck
} = require('./helpers')

class WrkCoreKycApi extends WrkApi {
  constructor (conf, ctx) {
    super(conf, ctx)
    this.loadConf('kyc.core', 'core')
    this.init()
    this.start()
  }

  getPluginCtx (type) {
    super.init()

    const ctx = super.getPluginCtx(type)

    switch (type) {
      case 'api_bfx':
        ctx.dbMongo_m0 = this.dbMongo_m0
        ctx.auth_google = this.authGoogle_a0
        ctx.grc_s3 = this.grcS3_s0
        break
    }

    return ctx
  }

  async _start0 (cb) {
    const mc = this.dbMongo_m0.db
    await initMongoDbParams(mc)

    const scheduler = this.scheduler_sc
    const worker = this
    initSchedulerExpirationIdCheck(scheduler, worker)

    cb()
  }

  init () {
    super.init()
    const mongoOpts = (argv.mongo) ? { mongoUri: argv.mongo } : {}
    const authOpts = (argv.test)
      ? { conf: require('../test/config/facs/auth-google.config') }
      : {}

    this.setInitFacs([
      ['fac', 'bfx-facs-db-mongo', 'm0', 'm0', mongoOpts],
      ['fac', 'bfx-facs-auth-google', 'a0', 'a0', authOpts],
      ['fac', 'bfx-facs-grc-s3', 's0', 's0', {}],
      ['fac', 'bfx-facs-scheduler', 'sc', 'sc', {}]
    ])
  }
}

module.exports = WrkCoreKycApi
