const BFX = require('bitfinex-api-node')

const apiKey = '8jIlukbQYYjPAhI0TfVlqDqzQwLtQr9C7hW0UMyVjWj'
const apiSecret = 'kPZPQ4Y15TQXdVqXm1rcYBwnznbyTQRcr9ymBI0kuXb'

const bfx = new BFX({
  apiKey,
  apiSecret
})

const rest2 = bfx.rest(2, {
  // options
  transform: true
})

var prices = []

const call = async () => {
  var i
  for (i = 0; i < 10; i++) {
    const req = await rest2.ticker('tXRPUSD')
    prices.push(req.lastPrice.toFixed(4))
    console.log(prices)
  }
}

call()
