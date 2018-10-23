'use strict'

const workerArgs = ['rest:core:user']

function addFunctions (ExtApi) {
  ExtApi.prototype.checkAuthToken = function (space, token, opts = {}, cb) {
    if (!opts.ip) return cb(new Error('ERR_CORE_USER_IP_IS_NEEDED'))
    opts.ip = opts.loc ? '0' : (opts.ip || 'unk')

    const validTokens = {
      'FOO': 96938411,
      'BAR': 82313321,
      'BAZ': 74677531,
      'TUB': 66938411,
      'WUB': 52313321,
      'BFX': 44677531,
      'MAX': 36938411,
      'TIX': 22313321,
      'BIX': 14673331
    }

    const id = (validTokens[token]) ? validTokens[token] : null
    if (!id) return cb(new Error('ERR_CORE_USER_TOKEN_INVALID'))

    const user = {
      id,
      username: `username${token}`,
      email: `${token}@email.com`,
      created_at: new Date(),
      updated_at: new Date()
    }
    const grcBfx = this.ctx.grc_bfx
    const call = {
      worker: 'user.core',
      on: 'checkAuthToken',
      params: { token, opts },
      res: { user },
      timestamp: Date.now()
    }
    grcBfx.req('rest:ext:testcalls', 'addCall', [call], { timeout: 2000 }, (err, data) => {
      if (err) cb(new Error('user.core:checkAuthToken:testcalls'))
      else return cb(null, user)
    })
  }

  ExtApi.prototype.getSummary = function (space, user, tf, cb) {
    const summary = {
      time: '2018-06-07T19:19:40.138632+00:00',
      trade_vol_30d: [
        { curr: 'BTC', vol: '8.22173936' },
        { curr: 'ETH', vol: '0.0' },
        { curr: 'IOTA', vol: '0.0' },
        { curr: 'XRP', vol: 0 },
        { curr: 'REP', vol: 0 },
        {
          curr: 'Total (USD)',
          vol: '73036.14983749',
          vol_maker: '64287.84978774',
          vol_BFX: '73036.14983749',
          vol_BFX_maker: '64287.84978774',
          vol_ETHFX: 0,
          vol_ETHFX_maker: 0
        }
      ],
      funding_profit_30d: [
        { curr: 'USD', amount: '15.79819087' },
        { curr: 'BTC', amount: '0.0' },
        { curr: 'ETH', amount: '0.0' },
        { curr: 'JPY', amount: '0.0' },
        { curr: 'EUR', amount: '0.0' }
      ],
      maker_fee: 0.001,
      taker_fee: 0.002
    }
    const grcBfx = this.ctx.grc_bfx
    const call = {
      worker: 'user.core',
      on: 'getSummary',
      params: { user, tf },
      res: { summary },
      timestamp: Date.now()
    }
    grcBfx.req('rest:ext:testcalls', 'addCall', [call], { timeout: 2000 }, (err, data) => {
      if (err) cb(new Error('user.core:getSummary:testcalls'))
      else return cb(null, summary)
    })
  }
}

module.exports = {
  addFunctions,
  workerArgs
}
