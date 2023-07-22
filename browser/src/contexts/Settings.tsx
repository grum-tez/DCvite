import { NetworkType } from '@airgap/beacon-sdk'
import constate from 'constate'
import { useState } from 'react'

const sandboxSettings = {
  app_name: 'My DApp',
  endpoint: 'http://localhost:20000',
  network: NetworkType.CUSTOM,
  contract: 'KT1X4mnH5iCxJ1HaTPBokkHBkHTV1ir7WCH7',
}

const ghostnetSettings = {
  app_name: 'My DApp',
  endpoint: 'https://ghostnet.tezos.marigold.dev',
  network: NetworkType.GHOSTNET,
  contract: 'KT1FE4Mj2XxYvu26B8GhgS6EXKqUPKbzZABi',
}

export const [
  SettingsProvider,
  useAppName,
  useEndpoint,
  useNetwork,
  useContractAddress,
] = constate(
  () => {
    const [settingsState] = useState(sandboxSettings)
    return settingsState
  },
  (v) => v.app_name,
  (v) => v.endpoint,
  (v) => v.network,
  (v) => v.contract
)
