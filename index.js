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
const call = async () => {
  const req = await rest2.ticker('tXRPUSD')
  console.log('req', req)
}

call()
