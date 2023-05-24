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
import { UniswapInfo } from '../../pb/proto/service_connectweb'
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
  console.log('fetchPoolDayDatas ', addresses)
  // const response = await sfKVClient.poolDayDatas({
  //   startTime: 1619170975,
  //   addresses: addresses,
  // })
  // console.log(response)
  // @ts-ignore
  return {
    poolDaysData: [
      { tvlUSD: 10, date: 620086400, volumeUSD: 1000000 },
      { tvlUSD: 52910155.58147882, date: 1620172800, volumeUSD: 6788082.942227511 },
      { tvlUSD: 143969610.89631563, date: 1620259200, volumeUSD: 122538162.52303714 },
      { tvlUSD: 207867181.50294587, date: 1620345600, volumeUSD: 214627889.655268 },
      { tvlUSD: 203997370.52353895, date: 1620432000, volumeUSD: 288344412.2870888 },
      { tvlUSD: 220189661.8535931, date: 1620518400, volumeUSD: 258164184.03197885 },
      { tvlUSD: 138748697.05128056, date: 1620604800, volumeUSD: 475023304.0107992 },
      { tvlUSD: 251751375.2943119, date: 1620691200, volumeUSD: 389781195.936554 },
      { tvlUSD: 226737423.01607445, date: 1620777600, volumeUSD: 752450894.1992666 },
      { tvlUSD: 164088508.38652238, date: 1620864000, volumeUSD: 1150328280.3963685 },
      { tvlUSD: 331227946.1233817, date: 1620950400, volumeUSD: 576639881.9788588 },
      { tvlUSD: 322163020.71246755, date: 1621036800, volumeUSD: 575232560.8396949 },
      { tvlUSD: 284063632.28612095, date: 1621123200, volumeUSD: 803078684.2988763 },
      { tvlUSD: 216671671.82817146, date: 1621209600, volumeUSD: 1013226633.4838085 },
      { tvlUSD: 299632066.9618742, date: 1621296000, volumeUSD: 797356965.5794648 },
      { tvlUSD: -119042904.37675452, ate: 1621382400, volumeUSD: 1794113053.1111739 },
      { tvlUSD: 135168215.7292886, date: 1621468800, volumeUSD: 1222496202.2563808 },
      { tvlUSD: 136461653.56257907, date: 1621555200, volumeUSD: 1062673367.2511069 },
      { tvlUSD: 228336369.57732826, date: 1621641600, volumeUSD: 797558038.0466329 },
      { tvlUSD: 90931145.06191394, date: 1621728000, volumeUSD: 1318366278.4776444 },
      { tvlUSD: 298422625.62299734, date: 1621814400, volumeUSD: 1213785906.9976122 },
      { tvlUSD: 435746075.10758144, date: 1621900800, volumeUSD: 1111294898.0798776 },
      { tvlUSD: 544063585.0982791, date: 1621987200, volumeUSD: 1078212087.6040053 },
      { tvlUSD: 690515813.6268879, date: 1622073600, volumeUSD: 821773034.9555477 },
      { tvlUSD: 611781052.6500099, date: 1622160000, volumeUSD: 1036507671.9673941 },
      { tvlUSD: 585043381.8507637, date: 1622246400, volumeUSD: 1068348808.2202927 },
      { tvlUSD: 702583406.2153087, date: 1622332800, volumeUSD: 876058757.5456748 },
      { tvlUSD: 830098223.5758288, date: 1622419200, volumeUSD: 770764634.742417 },
      { tvlUSD: 818524704.8115212, date: 1622505600, volumeUSD: 685551000.1740247 },
      { tvlUSD: 918967052.5828253, date: 1622592000, volumeUSD: 514015223.3875476 },
      { tvlUSD: 930398324.9802666, date: 1622678400, volumeUSD: 605332038.1583039 },
      { tvlUSD: 853309386.5071204, date: 1622764800, volumeUSD: 814363246.3544216 },
      { tvlUSD: 899061338.8070602, date: 1622851200, volumeUSD: 609317506.4330577 },
      { tvlUSD: 1015173523.9350139, date: 1622937600, volumeUSD: 360073404.9974443 },
      { tvlUSD: 835544295.8665496, date: 1623024000, volumeUSD: 668474157.3726879 },
      { tvlUSD: 793432781.0867199, date: 1623110400, volumeUSD: 1088765238.905042 },
      { tvlUSD: 821258568.3491784, date: 1623196800, volumeUSD: 1010164914.7762257 },
      { tvlUSD: 880384260.7772745, date: 1623283200, volumeUSD: 707032809.9187126 },
      { tvlUSD: 833678128.5763127, date: 1623369600, volumeUSD: 631604684.7532278 },
      { tvlUSD: 838952500.7102447, date: 1623456000, volumeUSD: 595139738.4497751 },
      { tvlUSD: 888009113.6142857, date: 1623542400, volumeUSD: 609202638.0176101 },
      { tvlUSD: 907922506.8971276, date: 1623628800, volumeUSD: 588102353.2983536 },
      { tvlUSD: 928957857.209068, date: 1623715200, volumeUSD: 601010734.3676301 },
      { tvlUSD: 895393497.0684679, date: 1623801600, volumeUSD: 554238077.4117008 },
      { tvlUSD: 911730706.886837, date: 1623888000, volumeUSD: 528865322.83385926 },
      { tvlUSD: 860198576.6818186, date: 1623974400, volumeUSD: 690695525.8318945 },
      { tvlUSD: 869218948.6746595, date: 1624060800, volumeUSD: 525526421.57364297 },
      { tvlUSD: 868388547.5848429, date: 1624147200, volumeUSD: 711402651.9781243 },
      { tvlUSD: 588526135.3558383, date: 1624233600, volumeUSD: 1298297044.7043824 },
      { tvlUSD: 637920886.9301397, date: 1624320000, volumeUSD: 1065917121.816594 },
      { tvlUSD: 787056334.7423676, date: 1624406400, volumeUSD: 731284524.7339985 },
      { tvlUSD: 778229528.6448665, date: 1624492800, volumeUSD: 546011325.7403754 },
      { tvlUSD: 704064957.6187499, date: 1624579200, volumeUSD: 710877861.6845636 },
      { tvlUSD: 688464388.1702834, date: 1624665600, volumeUSD: 639511265.0846226 },
      { tvlUSD: 790788401.4432287, date: 1624752000, volumeUSD: 647447566.1467377 },
      { tvlUSD: 809449816.4652838, date: 1624838400, volumeUSD: 772249225.436432 },
      { tvlUSD: 845399361.0609643, date: 1624924800, volumeUSD: 678189703.6313396 },
      { tvlUSD: 829053559.3879263, date: 1625011200, volumeUSD: 744180037.8146484 },
      { tvlUSD: 810847504.3668348, date: 1625097600, volumeUSD: 687218823.8554729 },
      { tvlUSD: 856799508.9382256, date: 1625184000, volumeUSD: 533572204.81315416 },
      { tvlUSD: 865451051.600114, date: 1625270400, volumeUSD: 450731596.89227253 },
      { tvlUSD: 870247295.9167752, date: 1625356800, volumeUSD: 477946088.04639196 },
      { tvlUSD: 832081231.8303814, date: 1625443200, volumeUSD: 609630533.768199 },
      { tvlUSD: 815701289.3437954, date: 1625529600, volumeUSD: 737936197.2316204 },
      { tvlUSD: 833417880.4262443, date: 1625616000, volumeUSD: 527877979.3419985 },
      { tvlUSD: 783379618.469235, date: 1625702400, volumeUSD: 729800712.1971483 },
      { tvlUSD: 833619289.56646, date: 1625788800, volumeUSD: 576193963.3620392 },
      { tvlUSD: 853970215.0396525, date: 1625875200, volumeUSD: 548938359.5121275 },
      { tvlUSD: 902110982.7608232, date: 1625961600, volumeUSD: 301087177.18788433 },
      { tvlUSD: 847019076.0451955, date: 1626048000, volumeUSD: 433109056.3352157 },
      { tvlUSD: 802046374.575992, date: 1626134400, volumeUSD: 579915739.8122218 },
      { tvlUSD: 779964601.0756725, date: 1626220800, volumeUSD: 590088999.0437772 },
      { tvlUSD: 750440570.1013118, date: 1626307200, volumeUSD: 604032366.9506422 },
      { tvlUSD: 765536920.3397971, date: 1626393600, volumeUSD: 444528674.6960834 },
      { tvlUSD: 803592391.9648329, date: 1626480000, volumeUSD: 393791182.99071187 },
      { tvlUSD: 802548573.092272, date: 1626566400, volumeUSD: 437639723.48549515 },
      { tvlUSD: 779972147.0397052, date: 1626652800, volumeUSD: 420918115.44897705 },
      { tvlUSD: 737540726.4936224, date: 1626739200, volumeUSD: 601845019.5852404 },
      { tvlUSD: 776851681.6276628, date: 1626825600, volumeUSD: 841080356.427167 },
      { tvlUSD: 817884497.658068, date: 1626912000, volumeUSD: 708096619.3018992 },
      { tvlUSD: 900205287.5085901, date: 1626998400, volumeUSD: 525027914.9987863 },
      { tvlUSD: 928986014.3476653, date: 1627084800, volumeUSD: 523956851.69967175 },
      { tvlUSD: 955044975.7048249, date: 1627171200, volumeUSD: 470782999.98302364 },
      { tvlUSD: 822175187.854177, date: 1627257600, volumeUSD: 1530406800.873197 },
      { tvlUSD: 915280925.3249097, date: 1627344000, volumeUSD: 1011735363.3618703 },
      { tvlUSD: 951524156.9935224, date: 1627430400, volumeUSD: 942171161.2170316 },
      { tvlUSD: 1028383048.00352, date: 1627516800, volumeUSD: 515414040.9499282 },
      { tvlUSD: 1013632093.6695566, date: 1627603200, volumeUSD: 792696789.8663951 },
      { tvlUSD: 1039067035.4343644, date: 1627689600, volumeUSD: 535166410.6463881 },
      { tvlUSD: 980562969.9550043, date: 1627776000, volumeUSD: 809689763.0526786 },
      { tvlUSD: 1073445862.9028603, date: 1627862400, volumeUSD: 847162576.5708402 },
      { tvlUSD: 1012992426.7541851, date: 1627948800, volumeUSD: 1050570642.0022441 },
      { tvlUSD: 1024749697.2253356, date: 1628035200, volumeUSD: 1198322028.1897807 },
      { tvlUSD: 977715291.3396417, date: 1628121600, volumeUSD: 1335165992.0311568 },
      { tvlUSD: 1133573644.541687, date: 1628208000, volumeUSD: 1018944428.8119751 },
      { tvlUSD: 1086882811.7574165, date: 1628294400, volumeUSD: 1438426093.1817024 },
      { tvlUSD: 1134265127.1126192, date: 1628380800, volumeUSD: 1244574967.93885 },
      { tvlUSD: 960618785.0128821, date: 1628467200, volumeUSD: 1706123810.877856 },
      { tvlUSD: 1077684344.6771894, date: 1628553600, volumeUSD: 1091957536.1616907 },
      { tvlUSD: 1131194401.931057, date: 1628640000, volumeUSD: 859026398.9413506 },
      { tvlUSD: 1057805364.505487, date: 1628726400, volumeUSD: 1122515670.8468409 },
      { tvlUSD: 1144976844.0883458, date: 1628812800, volumeUSD: 806079482.688959 },
      { tvlUSD: 1306717066.1431048, date: 1628899200, volumeUSD: 570823746.7270877 },
      { tvlUSD: 1285143900.7843475, date: 1628985600, volumeUSD: 820706185.3573161 },
      { tvlUSD: 1250794508.0488367, date: 1629072000, volumeUSD: 944418399.2289543 },
      { tvlUSD: 1164762361.829954, date: 1629158400, volumeUSD: 1426958281.9020853 },
      { tvlUSD: 1208971250.6885974, date: 1629244800, volumeUSD: 1170584206.0193264 },
      { tvlUSD: 1290041248.4856658, date: 1629331200, volumeUSD: 946357102.9541594 },
      { tvlUSD: 1332318629.699987, date: 1629417600, volumeUSD: 848386818.3932517 },
      { tvlUSD: 1378080031.2560775, date: 1629504000, volumeUSD: 608267209.959479 },
      { tvlUSD: 1374118623.0252116, date: 1629590400, volumeUSD: 639453882.8137398 },
      { tvlUSD: 1381647053.491326, date: 1629676800, volumeUSD: 840355118.24692 },
      { tvlUSD: 1337831118.7453868, date: 1629763200, volumeUSD: 981307630.0755398 },
      { tvlUSD: 1374282583.9279563, date: 1629849600, volumeUSD: 886782085.2499228 },
      { tvlUSD: 1334991299.8411887, date: 1629936000, volumeUSD: 876183353.5512222 },
      { tvlUSD: 1397220706.6089656, date: 1630022400, volumeUSD: 760042089.3172718 },
      { tvlUSD: 1448737099.1236987, date: 1630108800, volumeUSD: 379827537.72502214 },
      { tvlUSD: 1426682856.7469685, date: 1630195200, volumeUSD: 613005826.4439735 },
      { tvlUSD: 1370444759.9112122, date: 1630281600, volumeUSD: 881338507.1818314 },
      { tvlUSD: 1363162105.6292174, date: 1630368000, volumeUSD: 1184874225.7917843 },
      { tvlUSD: 1305423823.1490047, date: 1630454400, volumeUSD: 1243927335.3833215 },
      { tvlUSD: 1291411265.6258855, date: 1630540800, volumeUSD: 975957068.4408237 },
      { tvlUSD: 1314678053.325354, date: 1630627200, volumeUSD: 973656563.9977635 },
      { tvlUSD: 1349397987.6294153, date: 1630713600, volumeUSD: 708248721.0762619 },
      { tvlUSD: 1363441722.7589986, date: 1630800000, volumeUSD: 679577746.8797901 },
      { tvlUSD: 1345431401.8255405, date: 1630886400, volumeUSD: 694108572.713629 },
      { tvlUSD: 874628650.0773933, date: 1630972800, volumeUSD: 1780196426.411378 },
      { tvlUSD: 1006327345.2482225, date: 1631059200, volumeUSD: 1376838173.6292188 },
      { tvlUSD: 1090249866.3908613, date: 1631145600, volumeUSD: 859198290.2959898 },
      { tvlUSD: 1001141965.476727, date: 1631232000, volumeUSD: 959808716.9111556 },
      { tvlUSD: 1072770433.7434142, date: 1631318400, volumeUSD: 630420774.488921 },
      { tvlUSD: 1084659422.507217, date: 1631404800, volumeUSD: 594106998.8246417 },
      { tvlUSD: 1006319490.3053626, date: 1631491200, volumeUSD: 911844207.2103059 },
      { tvlUSD: 1098878777.6512654, date: 1631577600, volumeUSD: 582002333.2680842 },
      { tvlUSD: 1133241231.455334, date: 1631664000, volumeUSD: 569840380.1645287 },
      { tvlUSD: 1134136801.2583306, date: 1631750400, volumeUSD: 825743878.4488404 },
      { tvlUSD: 1116637904.608, date: 1631836800, volumeUSD: 713564948.2672515 },
      { tvlUSD: 1156066118.7142148, date: 1631923200, volumeUSD: 511712303.16175765 },
      { tvlUSD: 1170699830.5249302, date: 1632009600, volumeUSD: 551114757.0204302 },
      { tvlUSD: 930664191.1915433, date: 1632096000, volumeUSD: 1702149637.4799562 },
      { tvlUSD: 879071090.0537502, date: 1632182400, volumeUSD: 1681808058.057056 },
      { tvlUSD: 1067868630.4748952, date: 1632268800, volumeUSD: 1044144221.572217 },
      { tvlUSD: 1120750962.8195496, date: 1632355200, volumeUSD: 776297706.6509854 },
      { tvlUSD: 1019640465.8651233, date: 1632441600, volumeUSD: 1170430538.5815132 },
      { tvlUSD: 1082672234.7810981, date: 1632528000, volumeUSD: 898997785.6419036 },
      { tvlUSD: 1089528004.7017953, date: 1632614400, volumeUSD: 1132969491.3354402 },
      { tvlUSD: 1118560291.3002539, date: 1632700800, volumeUSD: 882257013.223509 },
      { tvlUSD: 1070752250.5239314, date: 1632787200, volumeUSD: 789168599.7619017 },
      { tvlUSD: 1101296423.23091, date: 1632873600, volumeUSD: 644678555.8377436 },
      { tvlUSD: 1120772446.469937, date: 1632960000, volumeUSD: 855891930.8446568 },
      { tvlUSD: 1179501585.0803258, date: 1633046400, volumeUSD: 930047056.3763164 },
      { tvlUSD: 1214819720.7263005, date: 1633132800, volumeUSD: 633743307.6641694 },
      { tvlUSD: 1211948928.4357114, date: 1633219200, volumeUSD: 653592552.3047285 },
      { tvlUSD: 1175402446.641253, date: 1633305600, volumeUSD: 839348041.9782901 },
      { tvlUSD: 1249474700.4609096, date: 1633392000, volumeUSD: 618225196.4984374 },
      { tvlUSD: 1212172973.2905204, date: 1633478400, volumeUSD: 1054008812.1311951 },
      { tvlUSD: 1240848977.8434992, date: 1633564800, volumeUSD: 837093700.9236604 },
      { tvlUSD: 1267169489.4957855, date: 1633651200, volumeUSD: 704156764.1738528 },
      { tvlUSD: 1323398006.9190006, date: 1633737600, volumeUSD: 420696386.1580174 },
      { tvlUSD: 1246081668.1015494, date: 1633824000, volumeUSD: 778354331.5669856 },
      { tvlUSD: 1243703125.978456, date: 1633910400, volumeUSD: 927833555.6297487 },
      { tvlUSD: 1219372500.9004095, date: 1633996800, volumeUSD: 1050671843.0634677 },
      { tvlUSD: 1266147949.2921484, date: 1634083200, volumeUSD: 892110980.6027902 },
      { tvlUSD: 1300090020.175813, date: 1634169600, volumeUSD: 964351907.5526499 },
      { tvlUSD: 1349569086.7488804, date: 1634256000, volumeUSD: 1318504717.6855776 },
      { tvlUSD: 1384523451.431061, date: 1634342400, volumeUSD: 896805029.616742 },
      { tvlUSD: 1447311107.3571665, date: 1634428800, volumeUSD: 804096021.5961331 },
      { tvlUSD: 1424884739.9270582, date: 1634515200, volumeUSD: 994718118.836641 },
      { tvlUSD: 1484784906.4454641, date: 1634601600, volumeUSD: 1028688597.0107033 },
      { tvlUSD: 1538331466.3742073, date: 1634688000, volumeUSD: 1121920736.3017077 },
      { tvlUSD: 1395063382.254659, date: 1634774400, volumeUSD: 1997954288.4512482 },
      { tvlUSD: 1434582574.6137533, date: 1634860800, volumeUSD: 1226463425.6993861 },
      { tvlUSD: 1498842610.8224485, date: 1634947200, volumeUSD: 887121407.7990597 },
      { tvlUSD: 1522247580.9460464, date: 1635033600, volumeUSD: 826121446.3493335 },
      { tvlUSD: 1574863206.7141767, date: 1635120000, volumeUSD: 844766388.4676774 },
      { tvlUSD: 1495770250.2098775, date: 1635206400, volumeUSD: 1201035071.5313447 },
      { tvlUSD: 1366792768.3798919, date: 1635292800, volumeUSD: 1650105529.681486 },
      { tvlUSD: 1517220125.3409166, date: 1635379200, volumeUSD: 1446959841.7338002 },
      { tvlUSD: 1618384912.7893848, date: 1635465600, volumeUSD: 1018140462.5443792 },
      { tvlUSD: 1661190850.967819, date: 1635552000, volumeUSD: 665873381.7419482 },
      { tvlUSD: 1663145995.135778, date: 1635638400, volumeUSD: 693565170.9096404 },
      { tvlUSD: 1666031957.4732919, date: 1635724800, volumeUSD: 783210726.425746 },
      { tvlUSD: 1701932296.9324331, date: 1635811200, volumeUSD: 925343905.0588162 },
      { tvlUSD: 1724317306.742557, date: 1635897600, volumeUSD: 996534306.5978597 },
      { tvlUSD: 1708174296.4726093, date: 1635984000, volumeUSD: 812471162.1472315 },
      { tvlUSD: 1749483790.5570447, date: 1636070400, volumeUSD: 622513242.5654067 },
      { tvlUSD: 1779056965.9677136, date: 1636156800, volumeUSD: 651780298.6166486 },
      { tvlUSD: 1870969042.017979, date: 1636243200, volumeUSD: 566330825.2475975 },
      { tvlUSD: 1887091202.9102106, date: 1636329600, volumeUSD: 1053660310.87474 },
      { tvlUSD: 1868429185.185575, date: 1636416000, volumeUSD: 858600628.7168074 },
      { tvlUSD: 1740032761.3922887, date: 1636502400, volumeUSD: 1957165093.7797494 },
      { tvlUSD: 1889049886.965631, date: 1636588800, volumeUSD: 1088465483.417699 },
      { tvlUSD: 1824777585.1185987, date: 1636675200, volumeUSD: 1463543556.4660504 },
      { tvlUSD: 1949362858.010869, date: 1636761600, volumeUSD: 631759165.0991237 },
      { tvlUSD: 1923940029.798237, date: 1636848000, volumeUSD: 845734120.4340929 },
      { tvlUSD: 1888388028.0731063, date: 1636934400, volumeUSD: 1046454273.243894 },
      { tvlUSD: 1745905352.4937887, date: 1637020800, volumeUSD: 1898116354.572506 },
      { tvlUSD: 2011774330.9296298, date: 1637107200, volumeUSD: 1367301192.5201426 },
      { tvlUSD: 1919910658.1327558, date: 1637193600, volumeUSD: 1903324884.1197433 },
      { tvlUSD: 2083403400.781464, date: 1637280000, volumeUSD: 1347165742.9808745 },
      { tvlUSD: 2152030821.736309, date: 1637366400, volumeUSD: 921108323.2484385 },
      { tvlUSD: 2111251140.7710505, date: 1637452800, volumeUSD: 961953441.57866 },
      { tvlUSD: 2005734694.882641, date: 1637539200, volumeUSD: 1679058236.6214328 },
      { tvlUSD: 2078177410.9187396, date: 1637625600, volumeUSD: 1475295057.3062744 },
      { tvlUSD: 2106738105.4749448, date: 1637712000, volumeUSD: 1385342097.861645 },
      { tvlUSD: 2153578684.838824, date: 1637798400, volumeUSD: 1317883474.7413077 },
      { tvlUSD: 1845362450.4337068, date: 1637884800, volumeUSD: 2466948376.1135902 },
      { tvlUSD: 2030592253.4721975, date: 1637971200, volumeUSD: 1063331152.9386529 },
      { tvlUSD: 2016059824.4880702, date: 1638057600, volumeUSD: 1466386606.4678717 },
      { tvlUSD: 2141140898.7524393, date: 1638144000, volumeUSD: 1371448307.0233526 },
      { tvlUSD: 1964282758.8556514, date: 1638230400, volumeUSD: 2548454273.1325936 },
      { tvlUSD: 2010848909.165799, date: 1638316800, volumeUSD: 1826594392.5359526 },
      { tvlUSD: 2030783005.8570952, date: 1638403200, volumeUSD: 1924002234.1898026 },
      { tvlUSD: 2008575857.7130408, date: 1638489600, volumeUSD: 2454186352.4614167 },
      { tvlUSD: 1808878191.325093, date: 1638576000, volumeUSD: 3570641693.44898 },
      { tvlUSD: 2030086021.516633, date: 1638662400, volumeUSD: 2227690384.9546957 },
      { tvlUSD: 2013575634.665147, date: 1638748800, volumeUSD: 2924159148.78348 },
      { tvlUSD: 2165720935.023704, date: 1638835200, volumeUSD: 1570042600.2313313 },
      { tvlUSD: 2192816429.6444445, date: 1638921600, volumeUSD: 1528805987.0829244 },
      { tvlUSD: 2056467594.7590384, date: 1639008000, volumeUSD: 2291430730.059956 },
      { tvlUSD: 1956411431.115555, date: 1639094400, volumeUSD: 2604937760.3676224 },
      { tvlUSD: 2098091899.6305444, date: 1639180800, volumeUSD: 1701729315.5825346 },
      { tvlUSD: 2247582884.8124533, date: 1639267200, volumeUSD: 1093274640.4926562 },
      { tvlUSD: 2012019142.4725022, date: 1639353600, volumeUSD: 1967092372.4585326 },
      { tvlUSD: 2021531256.0309153, date: 1639440000, volumeUSD: 1587036894.0958226 },
      { tvlUSD: 1964893863.564929, date: 1639526400, volumeUSD: 2643468400.953292 },
      { tvlUSD: 2060066152.3831155, date: 1639612800, volumeUSD: 1521446636.13562 },
      { tvlUSD: 1996370348.8696072, date: 1639699200, volumeUSD: 2069236702.5221515 },
      { tvlUSD: 2129645923.0564785, date: 1639785600, volumeUSD: 1407957846.9510903 },
      { tvlUSD: 2165621137.087764, date: 1639872000, volumeUSD: 1284745788.4581807 },
      { tvlUSD: 2131883650.1998382, date: 1639958400, volumeUSD: 1737657030.1808796 },
      { tvlUSD: 2256269430.5465045, date: 1640044800, volumeUSD: 1170997985.1593635 },
      { tvlUSD: 2271480134.089047, date: 1640131200, volumeUSD: 943217326.7602274 },
      { tvlUSD: 2223665233.658553, date: 1640217600, volumeUSD: 1279882998.0086336 },
      { tvlUSD: 2227768384.8203998, date: 1640304000, volumeUSD: 945992362.0124446 },
      { tvlUSD: 2254263160.1891155, date: 1640390400, volumeUSD: 841170853.3404872 },
      { tvlUSD: 2252529867.6338487, date: 1640476800, volumeUSD: 812975297.294769 },
      { tvlUSD: 2253393806.6941586, date: 1640563200, volumeUSD: 717669863.123762 },
      { tvlUSD: 2066713508.024463, date: 1640649600, volumeUSD: 1606106412.9269495 },
      { tvlUSD: 2090018787.5830076, date: 1640736000, volumeUSD: 993110968.1158273 },
      { tvlUSD: 2119302712.519954, date: 1640822400, volumeUSD: 838853450.7973919 },
      { tvlUSD: 2078669946.09613, date: 1640908800, volumeUSD: 888834281.1385833 },
      { tvlUSD: 2158879337.5557094, date: 1640995200, volumeUSD: 652422206.9444381 },
      { tvlUSD: 2177972075.3154225, date: 1641081600, volumeUSD: 678374846.0193623 },
      { tvlUSD: 2151003275.952336, date: 1641168000, volumeUSD: 793132030.9342088 },
      { tvlUSD: 2143675925.8460183, date: 1641254400, volumeUSD: 1095410635.5221193 },
      { tvlUSD: 1977022948.2475977, date: 1641340800, volumeUSD: 1567723542.1547685 },
      { tvlUSD: 1958199503.9749866, date: 1641427200, volumeUSD: 1442744343.6274338 },
      { tvlUSD: 1726918556.5856376, date: 1641513600, volumeUSD: 1809959978.538798 },
      { tvlUSD: 1847742847.6092875, date: 1641600000, volumeUSD: 1524834925.7116656 },
      { tvlUSD: 1916635753.0635998, date: 1641686400, volumeUSD: 840721223.183659 },
      { tvlUSD: 1855677314.4798908, date: 1641772800, volumeUSD: 1751667920.6654086 },
      { tvlUSD: 1992517569.7218702, date: 1641859200, volumeUSD: 1114157941.9400852 },
      { tvlUSD: 1883218929.5205605, date: 1641945600, volumeUSD: 1095359900.639232 },
      { tvlUSD: 1839516836.866003, date: 1642032000, volumeUSD: 1332391480.1654842 },
      { tvlUSD: 1887528219.816839, date: 1642118400, volumeUSD: 986117396.0056376 },
      { tvlUSD: 1941486800.6224558, date: 1642204800, volumeUSD: 639251715.3481039 },
      { tvlUSD: 1948411153.0822396, date: 1642291200, volumeUSD: 657470263.0858768 },
      { tvlUSD: 1878188474.7974267, date: 1642377600, volumeUSD: 1096494276.387828 },
      { tvlUSD: 2038610792.1932216, date: 1642464000, volumeUSD: 1191310647.347699 },
      { tvlUSD: 2008069376.43015, date: 1642550400, volumeUSD: 1224155958.142054 },
      { tvlUSD: 1955696780.1861794, date: 1642636800, volumeUSD: 1323966013.8645322 },
      { tvlUSD: 1389467955.7144291, date: 1642723200, volumeUSD: 3722434815.9256883 },
      { tvlUSD: 1470856163.234882, date: 1642809600, volumeUSD: 2304936302.8971252 },
      { tvlUSD: 1622437222.3316445, date: 1642896000, volumeUSD: 2023572860.554385 },
      { tvlUSD: 1496397272.6041083, date: 1642982400, volumeUSD: 2783601335.8614626 },
      { tvlUSD: 1680750510.525967, date: 1643068800, volumeUSD: 1378643275.9725246 },
      { tvlUSD: 1596752458.491246, date: 1643155200, volumeUSD: 2322707241.7645845 },
      { tvlUSD: 1684529186.952356, date: 1643241600, volumeUSD: 1735940161.3735452 },
      { tvlUSD: 1789947799.1807492, date: 1643328000, volumeUSD: 1379732746.1425128 },
      { tvlUSD: 1887132581.9931812, date: 1643414400, volumeUSD: 935850046.1513661 },
      { tvlUSD: 1914010708.3149142, date: 1643500800, volumeUSD: 813085319.7684944 },
      { tvlUSD: 1958059750.4732568, date: 1643587200, volumeUSD: 1102358962.5006888 },
      { tvlUSD: 2004090431.3310454, date: 1643673600, volumeUSD: 1342922207.027806 },
      { tvlUSD: 2003538669.6358511, date: 1643760000, volumeUSD: 1234396935.104597 },
      { tvlUSD: 2032984313.2273355, date: 1643846400, volumeUSD: 1154157895.8241804 },
      { tvlUSD: 2053775522.5584824, date: 1643932800, volumeUSD: 1249244236.889977 },
      { tvlUSD: 2278418225.468174, date: 1644019200, volumeUSD: 1157754213.1059744 },
      { tvlUSD: 2350337402.442791, date: 1644105600, volumeUSD: 836360620.2477268 },
      { tvlUSD: 2348530387.881621, date: 1644192000, volumeUSD: 1194545833.3434906 },
      { tvlUSD: 2332055295.3567905, date: 1644278400, volumeUSD: 1215023100.71303 },
      { tvlUSD: 2426770925.74399, date: 1644364800, volumeUSD: 1098482235.0304742 },
      { tvlUSD: 2300876926.5859594, date: 1644451200, volumeUSD: 1764362936.4442918 },
      { tvlUSD: 2238241871.7345095, date: 1644537600, volumeUSD: 1809637042.1422524 },
      { tvlUSD: 2347579208.282117, date: 1644624000, volumeUSD: 1134292234.809253 },
      { tvlUSD: 2370497943.534788, date: 1644710400, volumeUSD: 706558646.699286 },
      { tvlUSD: 2415153749.1977167, date: 1644796800, volumeUSD: 952048275.3938946 },
      { tvlUSD: 2533692613.5361953, date: 1644883200, volumeUSD: 1205187716.9880512 },
      { tvlUSD: 2628499033.8004966, date: 1644969600, volumeUSD: 1193868880.314256 },
      { tvlUSD: 2487101348.754908, date: 1645056000, volumeUSD: 1566341874.703322 },
      { tvlUSD: 2451424862.211586, date: 1645142400, volumeUSD: 1271799109.610855 },
      { tvlUSD: 2397280840.5311375, date: 1645228800, volumeUSD: 724502308.210832 },
      { tvlUSD: 2302813150.2237797, date: 1645315200, volumeUSD: 1296179338.3452833 },
      { tvlUSD: 2196707666.3480444, date: 1645401600, volumeUSD: 2021289043.860418 },
      { tvlUSD: 2273262481.013795, date: 1645488000, volumeUSD: 1442735025.3875184 },
      { tvlUSD: 2295071776.287864, date: 1645574400, volumeUSD: 1256056886.7096078 },
      { tvlUSD: 2080046693.8487542, date: 1645660800, volumeUSD: 3040850116.625599 },
      { tvlUSD: 2270770960.4224095, date: 1645747200, volumeUSD: 1913984527.8768866 },
      { tvlUSD: 2354789605.8871517, date: 1645833600, volumeUSD: 1058646258.4112304 },
      { tvlUSD: 2254850607.1320677, date: 1645920000, volumeUSD: 1734657694.393748 },
      { tvlUSD: 2357896652.9818854, date: 1646006400, volumeUSD: 1793643702.7512264 },
      { tvlUSD: 2516810490.989441, date: 1646092800, volumeUSD: 1657118346.0639892 },
      { tvlUSD: 2525158383.8574414, date: 1646179200, volumeUSD: 1738885981.3764696 },
      { tvlUSD: 2537252722.1445823, date: 1646265600, volumeUSD: 1086847988.5354197 },
      { tvlUSD: 2376248010.7655683, date: 1646352000, volumeUSD: 1598067136.861629 },
      { tvlUSD: 2507276265.523489, date: 1646438400, volumeUSD: 650864675.9852062 },
      { tvlUSD: 2454951066.453164, date: 1646524800, volumeUSD: 832447481.7181958 },
      { tvlUSD: 2384230346.7922373, date: 1646611200, volumeUSD: 1273360934.9016783 },
      { tvlUSD: 2420245017.048065, date: 1646697600, volumeUSD: 1399256449.610709 },
      { tvlUSD: 2512165598.6859584, date: 1646784000, volumeUSD: 1158442684.9736412 },
      { tvlUSD: 2453641588.016614, date: 1646870400, volumeUSD: 1045098123.7136924 },
      { tvlUSD: 2467973256.96835, date: 1646956800, volumeUSD: 1034868950.5583727 },
      { tvlUSD: 2539161407.9701867, date: 1647043200, volumeUSD: 478557974.2675141 },
      { tvlUSD: 2470474190.175189, date: 1647129600, volumeUSD: 729321620.5686233 },
      { tvlUSD: 2494917932.4833484, date: 1647216000, volumeUSD: 904655660.1312886 },
      { tvlUSD: 2476716960.151526, date: 1647302400, volumeUSD: 927211816.4422857 },
      { tvlUSD: 2470023477.345033, date: 1647388800, volumeUSD: 1526110237.8012435 },
      { tvlUSD: 2525766992.4401383, date: 1647475200, volumeUSD: 981578726.1948344 },
      { tvlUSD: 2566006257.6829057, date: 1647561600, volumeUSD: 1270176117.1352546 },
      { tvlUSD: 2606249702.584055, date: 1647648000, volumeUSD: 789722262.1808817 },
      { tvlUSD: 2549904724.9717064, date: 1647734400, volumeUSD: 900825336.8410014 },
      { tvlUSD: 2498786583.342521, date: 1647820800, volumeUSD: 975137727.4441551 },
      { tvlUSD: 2545542655.6568236, date: 1647907200, volumeUSD: 1163266096.1950276 },
      { tvlUSD: 2493865942.713394, date: 1647993600, volumeUSD: 988009118.8135928 },
      { tvlUSD: 2509033244.796805, date: 1648080000, volumeUSD: 1560327741.3337183 },
      { tvlUSD: 2537727321.7629166, date: 1648166400, volumeUSD: 1241804723.195183 },
      { tvlUSD: 2626297886.1790266, date: 1648252800, volumeUSD: 601322940.5452567 },
      { tvlUSD: 2642637450.4749727, date: 1648339200, volumeUSD: 841404952.6814585 },
      { tvlUSD: 2581921097.140694, date: 1648425600, volumeUSD: 1242101615.0603108 },
      { tvlUSD: 2611741673.0538225, date: 1648512000, volumeUSD: 1330353457.0943491 },
      { tvlUSD: 2649531265.0075603, date: 1648598400, volumeUSD: 1160284777.426769 },
      { tvlUSD: 2591730513.667243, date: 1648684800, volumeUSD: 1198315695.8139517 },
      { tvlUSD: 2632069646.5425663, date: 1648771200, volumeUSD: 1280913844.228675 },
      { tvlUSD: 2651244792.8467727, date: 1648857600, volumeUSD: 1138537393.3179135 },
      { tvlUSD: 2699789958.882541, date: 1648944000, volumeUSD: 860291669.5962299 },
      { tvlUSD: 2691936695.0923753, date: 1649030400, volumeUSD: 1133579228.099045 },
      { tvlUSD: 2699894854.235683, date: 1649116800, volumeUSD: 1110617178.9237294 },
      { tvlUSD: 2559531480.8714905, date: 1649203200, volumeUSD: 1932085776.2585795 },
      { tvlUSD: 2673121615.0230017, date: 1649289600, volumeUSD: 1248162332.6311276 },
      { tvlUSD: 2578307098.2241945, date: 1649376000, volumeUSD: 1458357915.1469803 },
      { tvlUSD: 2721327474.390922, date: 1649462400, volumeUSD: 722821213.3036133 },
      { tvlUSD: 2683908671.7089334, date: 1649548800, volumeUSD: 636833905.1001204 },
      { tvlUSD: 2465517610.6393366, date: 1649635200, volumeUSD: 2158750591.1290727 },
      { tvlUSD: 2551778310.494363, date: 1649721600, volumeUSD: 1636382602.5347955 },
      { tvlUSD: 2607304298.7971535, date: 1649808000, volumeUSD: 1186833954.9048073 },
      { tvlUSD: 2637885164.188549, date: 1649894400, volumeUSD: 1021318534.6225919 },
      { tvlUSD: 2603483370.4891276, date: 1649980800, volumeUSD: 728762153.9239613 },
    ],
  }
}
