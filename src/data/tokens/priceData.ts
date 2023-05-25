import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import weekOfYear from 'dayjs/plugin/weekOfYear'
import gql from 'graphql-tag'
import { getBlocksFromTimestamps } from 'hooks/useBlocksFromTimestamps'
import { PriceChartEntry } from 'types'

// format dayjs with the libraries that we need
dayjs.extend(utc)
dayjs.extend(weekOfYear)

export const PRICES_BY_BLOCK = (tokenAddress: string, blocks: any) => {
  let queryString = 'query blocks {'
  queryString += blocks.map(
    (block: any) => `
      t${block.timestamp}:token(id:"${tokenAddress}", block: { number: ${block.number} }, subgraphError: allow) { 
        derivedETH
      }
    `
  )
  queryString += ','
  queryString += blocks.map(
    (block: any) => `
      b${block.timestamp}: bundle(id:"1", block: { number: ${block.number} }, subgraphError: allow) { 
        ethPriceUSD
      }
    `
  )

  queryString += '}'
  return gql(queryString)
}

const PRICE_CHART = gql`
  query tokenHourDatas($startTime: Int!, $skip: Int!, $address: Bytes!) {
    tokenHourDatas(
      first: 100
      skip: $skip
      where: { token: $address, periodStartUnix_gt: $startTime }
      orderBy: periodStartUnix
      orderDirection: asc
    ) {
      periodStartUnix
      priceUSD
      high
      low
      open
      close
    }
  }
`

interface PriceResults {
  tokenHourDatas: {
    periodStartUnix: number
    priceUSD: string
    high: string
    low: string
    open: string
    close: string
  }[]
}

export async function fetchTokenPriceData(
  address: string,
  interval: number,
  startTimestamp: number,
  dataClient: ApolloClient<NormalizedCacheObject>,
  blockClient: ApolloClient<NormalizedCacheObject>
): Promise<{
  data: PriceChartEntry[]
  error: boolean
}> {
  // start and end bounds

  try {
    const endTimestamp = dayjs.utc().unix()

    if (!startTimestamp) {
      console.log('Error constructing price start timestamp')
      return {
        data: [],
        error: false,
      }
    }

    // create an array of hour start times until we reach current hour
    const timestamps = []
    let time = startTimestamp
    while (time <= endTimestamp) {
      timestamps.push(time)
      time += interval
    }

    // backout if invalid timestamp format
    if (timestamps.length === 0) {
      return {
        data: [],
        error: false,
      }
    }

    // fetch blocks based on timestamp
    const blocks = await getBlocksFromTimestamps(timestamps, blockClient, 500)
    if (!blocks || blocks.length === 0) {
      console.log('Error fetching blocks')
      return {
        data: [],
        error: false,
      }
    }

    let data: {
      periodStartUnix: number
      high: string
      low: string
      open: string
      close: string
    }[] = []
    let skip = 0
    let allFound = false
    while (!allFound) {
      const { data: priceData, errors, loading } = await dataClient.query<PriceResults>({
        query: PRICE_CHART,
        variables: {
          address: address,
          startTime: startTimestamp,
          skip,
        },
        fetchPolicy: 'no-cache',
      })

      // if a tokenHourData has a close of 0, this means that the "hour" hasn't finished yet,
      // so we simply set the close to the last price that was set
      for (let i = 0; i < priceData.tokenHourDatas.length; i++) {
        if (i == 0) {
          continue
        }
        if (priceData.tokenHourDatas[i].close == '0') {
          priceData.tokenHourDatas[i].close = priceData.tokenHourDatas[i - 1].close

          if (priceData.tokenHourDatas[i - 1].close == '0') {
            priceData.tokenHourDatas[i].close = priceData.tokenHourDatas[i].priceUSD
          }
        }

        if (priceData.tokenHourDatas[i].open == '0') {
          priceData.tokenHourDatas[i].open = priceData.tokenHourDatas[i - 1].open

          if (priceData.tokenHourDatas[i - 1].open == '0') {
            priceData.tokenHourDatas[i].open = priceData.tokenHourDatas[i].priceUSD
          }
        }

        if (priceData.tokenHourDatas[i].low == '0') {
          priceData.tokenHourDatas[i].low = priceData.tokenHourDatas[i - 1].low

          if (priceData.tokenHourDatas[i - 1].low == '0') {
            priceData.tokenHourDatas[i].low = priceData.tokenHourDatas[i].priceUSD
          }
        }

        if (priceData.tokenHourDatas[i].high == '0') {
          priceData.tokenHourDatas[i].high = priceData.tokenHourDatas[i - 1].high

          if (priceData.tokenHourDatas[i - 1].high == '0') {
            priceData.tokenHourDatas[i].high = priceData.tokenHourDatas[i].priceUSD
          }
        }
      }

      if (!loading) {
        skip += 100
        if ((priceData && priceData.tokenHourDatas.length < 100) || errors) {
          allFound = true
        }
        if (priceData) {
          data = data.concat(priceData.tokenHourDatas)
        }
      }
    }

    const formattedHistory = data.map((d) => {
      return {
        time: d.periodStartUnix,
        open: parseFloat(d.open),
        close: parseFloat(d.close),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
      }
    })

    return {
      data: formattedHistory,
      error: false,
    }
  } catch (e) {
    console.log(e)
    return {
      data: [],
      error: true,
    }
  }
}
