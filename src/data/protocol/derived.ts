import { SupportedNetwork } from 'constants/networks'
import { fetchPoolChartData } from 'data/pools/chartData'
import { usePoolDatas } from 'data/pools/poolData'
import { useTopPoolAddresses } from 'data/pools/topPools'
import { useEffect, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { AppDispatch } from 'state'
import { useActiveNetworkVersion, useDataClient } from 'state/application/hooks'
import { updatePoolChartData } from 'state/pools/actions'
import { PoolChartEntry, PoolData } from 'state/pools/reducer'
import { ChartDayData } from 'types'
import { POOL_HIDE } from '../../constants'
import { UniswapInfo } from '../../pb/proto/service_connect'
import { createConnectTransport, createPromiseClient } from '@bufbuild/connect-web'
import { PoolDayDatasResponse } from '../../pb/proto/service_pb'

// The transport defines what type of endpoint we're hitting.
// In our example we'll be communicating with a Connect endpoint.
const transport = createConnectTransport({
  baseUrl: 'http://localhost:7878',
})

const sfKVClient = createPromiseClient(UniswapInfo, transport)

/**
 * Calculates offset amount to avoid inaccurate USD data for global TVL.
 * @returns TVL value in USD
 */
export function useTVLOffset() {
  const [currentNetwork] = useActiveNetworkVersion()
  const { data } = usePoolDatas(POOL_HIDE[currentNetwork.id])

  const tvlOffset = useMemo(() => {
    if (!data) return undefined

    return Object.keys(data).reduce((accum: number, poolAddress) => {
      const poolData: PoolData = data[poolAddress]
      return accum + poolData.tvlUSD
    }, 0)
  }, [data])

  return tvlOffset
}

/**
 * Fecthes and formats data for pools that result in incorrect USD TVL.
 *
 * Note: not used currently but useful for debugging.
 *
 * @returns Chart data by day for values to offset accurate USD.
 */
export function useDerivedOffsetTVLHistory() {
  const dataClient = useDataClient()
  const [chartData, setChartData] = useState<{ [key: number]: ChartDayData } | undefined>(undefined)
  const dispatch = useDispatch<AppDispatch>()

  const [currentNetwork] = useActiveNetworkVersion()

  useEffect(() => {
    async function fetchAll() {
      // fetch all data for each pool
      const data = await POOL_HIDE[currentNetwork.id].reduce(
        async (accumP: Promise<{ [key: number]: ChartDayData }>, address) => {
          const accum = await accumP
          const { data } = await fetchPoolChartData(address, dataClient)
          if (!data) return accum
          dispatch(updatePoolChartData({ poolAddress: address, chartData: data, networkId: SupportedNetwork.ETHEREUM }))
          data.map((poolDayData: PoolChartEntry) => {
            const { date, totalValueLockedUSD, volumeUSD } = poolDayData
            const roundedDate = date
            if (!accum[roundedDate]) {
              accum[roundedDate] = {
                tvlUSD: 0,
                date: roundedDate,
                volumeUSD: 0,
              }
            }
            accum[roundedDate].tvlUSD = accum[roundedDate].tvlUSD + totalValueLockedUSD
            accum[roundedDate].volumeUSD = accum[roundedDate].volumeUSD + volumeUSD
          })
          return accum
        },
        Promise.resolve({} as { [key: number]: ChartDayData })
      )

      // Format as array
      setChartData(data)
    }

    if (!chartData) {
      fetchAll()
    }
  }, [chartData, currentNetwork.id, dataClient, dispatch])

  return chartData
}

// # of pools to include in historical chart volume and TVL data
const POOL_COUNT_FOR_AGGREGATE = 20

/**
 * Derives historical TVL data for top 50 pools.
 * @returns Chart data for aggregate Uniswap TVL over time.
 */
export function useDerivedProtocolTVLHistory() {
  const dataClient = useDataClient()
  const { addresses } = useTopPoolAddresses()
  const dispatch = useDispatch<AppDispatch>()

  const [currentNetwork] = useActiveNetworkVersion()

  const [chartData, setChartData] = useState<{ [key: string]: ChartDayData[] } | undefined>(undefined)

  useEffect(() => {
    async function fetchAll() {
      if (!addresses) {
        return
      }
      // fetch all data for each pool
      const data = await addresses
        .slice(0, POOL_COUNT_FOR_AGGREGATE) // @TODO: must be replaced with aggregate with subgraph data fixed.
        .reduce(async (accumP: Promise<{ [key: number]: ChartDayData }>, address) => {
          const accum = await accumP
          if (POOL_HIDE[currentNetwork.id].includes(address)) {
            return accum
          }
          const { data } = await fetchPoolChartData(address, dataClient)
          if (!data) return accum
          dispatch(updatePoolChartData({ poolAddress: address, chartData: data, networkId: currentNetwork.id }))
          data.map((poolDayData: PoolChartEntry) => {
            const { date, totalValueLockedUSD, volumeUSD } = poolDayData
            const roundedDate = date
            if (!accum[roundedDate]) {
              accum[roundedDate] = {
                tvlUSD: 0,
                date: roundedDate,
                volumeUSD: 0,
              }
            }
            accum[roundedDate].tvlUSD = accum[roundedDate].tvlUSD + totalValueLockedUSD
            accum[roundedDate].volumeUSD = accum[roundedDate].volumeUSD + volumeUSD
          })
          return accum
        }, Promise.resolve({} as { [key: number]: ChartDayData }))
      // Format as array
      setChartData({ ...chartData, [currentNetwork.id]: Object.values(data) })
    }

    async function fetchSF() {
      if (!addresses) {
        return
      }
      const topPools = addresses.slice(0, POOL_COUNT_FOR_AGGREGATE)
      const resp = await fetchPoolDayDatas(topPools)
      setChartData({ ...chartData, [currentNetwork.id]: resp.poolDaysData })
    }

    if (!chartData) {
      if (currentNetwork.id == 0) {
        fetchSF()
      } else {
        fetchAll()
      }
    }
  }, [addresses, chartData, currentNetwork.id, dataClient, dispatch])

  return chartData?.[currentNetwork.id]
}

// @ts-ignore
export async function fetchPoolDayDatas(addresses: string[]): PoolDayDatasResponse {
  return await sfKVClient.poolDayDatas({
    addresses: addresses,
  })
}
