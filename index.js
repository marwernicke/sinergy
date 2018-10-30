const finder = require('./finder')

// ////////////// MAIN //////////////// //
const fetchStart = finder.date(23, 10, 2018)
const fetchEnd = finder.date(24, 10, 2018)

const readStart = finder.date(25, 10, 2018)
const readEnd = finder.date(26, 10, 2018)

module.exports = {
  fetchStart,
  fetchEnd,
  readStart,
  readEnd
}

async function main () {
  console.log('inicializando...')
  const tradesArray = await finder.fetchTrades('tXRPUSD', fetchStart, fetchEnd)
  console.log('datos buscados2')
  await finder.fillDb(tradesArray)
  console.log('datos cargados2')
  console.log(await finder.leerDb(readStart, readEnd))
}
main()
