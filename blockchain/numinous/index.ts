import {
  Account,
  Parameters,
  delay_mockup_now_by_second,
} from '@completium/experiment-ts'
import { BigNumber } from 'bignumber.js'
import {
  ArchetypeType,
  Tez,
  CallResult,
  Duration,
  Address,
} from '@completium/archetype-ts-types'

//Stac answer:

import { LocalForger } from '@taquito/local-forging'
import { InMemorySigner } from '@taquito/signer'
import {
  OperationContents,
  OperationContentsTransaction,
  OpKind,
} from '@taquito/rpc'

//utils

function sumCostEstimate(callMakers: Array<CallMaker>, account: Account) {
  let total = new BigNumber(0)
  for (let cm of callMakers) {
    if (account === cm.as) {
      total = total.plus(cm.cost_estimate)
      break
    }
  }

  return total
}

const op_size_transaction: OperationContentsTransaction = {
  kind: OpKind.TRANSACTION,
  source: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
  fee: '1', //fee here is a placeholder value only
  counter: '72035',
  gas_limit: '1304',
  storage_limit: '0',
  amount: '0',
  destination: 'KT1Vrag7PFbjAmbmCJ9sAzYKxYkzvsqrUNEv',
  parameters: {
    entrypoint: 'default',
    value: {
      int: '4',
    },
  },
}

export async function compute_op_size(
  transaction: OperationContentsTransaction = op_size_transaction,
  secret_key: string = 'edsk3QoqBuvdamxouPhin7swCvkQNgq4jP5KZPbwWNnwdZpSpJiEbq'
) {
  const local_forge = new LocalForger()
  const opContents: OperationContents[] = [transaction]

  const forge_param = {
    //branch value is required placeholder value only and does not effect result
    branch: 'BLk3XprVitY86JimhijByZXcctLvsfkBmH16juNayRJbs3uHYbc',
    contents: opContents,
  }

  const op_bytes: string = await local_forge.forge(forge_param)

  const signer = new InMemorySigner(secret_key)
  const op_sign = await signer.sign(op_bytes)
  const op_size = op_sign.sbytes.length / 2
  return op_size
}

//Stac answer end

export interface costObject {
  call_description: string
  predicted_cost: BigNumber
}

export interface testParams {
  account: Account
  description: string
  expected_change: number
  ec_BN: BigNumber // expected_change as BigNumber
  expected_direction: 'increase' | 'decrease' | 'unchanged'
  expected_amount: string
  actual_before: BigNumber
  info_message: string
  error_message: string
  total_cost_estimate: BigNumber
  actual_after: BigNumber
  expected_after: BigNumber
  expected_after_approx_costs: BigNumber
  discrepancy: BigNumber
  tolerance: BigNumber

  // variable_function:
  // variable_before: any,
  // variable_after: any,
}

export function generateCall(
  contract: any,
  entrypoint: string
): (
  args: Array<ArchetypeType>,
  call_params: Parameters
) => Promise<CallResult> {
  return async (
    args: Array<ArchetypeType>,
    cp: Parameters
  ): Promise<CallResult> => {
    return contract[entrypoint](...args, cp)
  }
}

export interface CallMaker {
  description: string
  as: Account
  amount: Tez
  contract: any
  entrypoint: string
  args: Array<ArchetypeType>
  delay_after?: number | Duration | string
  cost_estimate: BigNumber
  call?: (
    args: Array<ArchetypeType>,
    call_params: Parameters
  ) => Promise<CallResult>
}

export function tezBNtoString(input: BigNumber) {
  if (input === new BigNumber(0)) return `0 tez`
  if (!input) throw Error(`tezBigNumberToString input is invalid.`)
  return `${input.dividedBy(1000000).toNumber()} tez`
}

export function posify(num: BigNumber): BigNumber {
  if (num.isNegative()) return num.negated()
  return num
}

const res = {
  operation_hash: 'op36m7td8UXUvCCUpZ72Xy3XLbU6pFf1VLF5y7cE6Rmb5qe7LNs',
  storage_size: 24698,
  consumed_gas: 15045.615,
  paid_storage_size_diff: 96,
  events: [],
}

export async function get_cost(
  storage_difference: number,
  gas_used: number,
  op_size: number
): Promise<BigNumber> {
  const fees = 100 + op_size + gas_used * 0.1
  const burn = storage_difference * 250
  return new BigNumber(fees + burn).integerValue(BigNumber.ROUND_UP)
}

export const handleDelayInput = (
  delay: number | Duration | string | undefined
): number => {
  let output = 0
  if (typeof delay == 'number') output = delay
  if (typeof delay == 'string') output = new Duration(delay).toSecond()
  if (delay instanceof Duration) output = delay.toSecond()
  return output
}

export interface MCGTout {
  delta: BigNumber
  call_result: CallResult
}

// with_cost function provides the cost of a transaction
export const make_call_get_delta = async (
  f: {
    (args: Array<ArchetypeType>, call_params: Parameters): Promise<CallResult>
  },
  args: Array<ArchetypeType>,
  call_params: Parameters
): Promise<MCGTout> => {
  const balance_before = await call_params.as.get_balance()
  const res = await f(args, call_params)

  const balance_after = await call_params.as.get_balance()
  return {
    delta: balance_after.minus(balance_before).to_big_number(),
    call_result: res,
  }
}

export async function run_scenario_test(
  // scenario_description: string,
  call_makers: CallMaker[],
  tpArray: Array<testParams>,
  mode: 'verbose' | 'quiet' = 'verbose'
): Promise<testParams[]> {
  for (const tp of tpArray) {
    tp.ec_BN = new BigNumber(tp.expected_change).times(1000000)
    tp.actual_before = (await tp.account.get_balance()).to_big_number()
    tp.expected_direction = tp.ec_BN.isZero()
      ? 'unchanged'
      : tp.ec_BN.isPositive()
      ? 'increase'
      : 'decrease'
    tp.expected_amount = new Tez(posify(tp.ec_BN), 'mutez').toString('tez')
  }

  for (const cm of call_makers) {
    if (!cm.amount)
      throw (
        'amount must be explicitly specified for account: ' + cm.as.get_name()
      )
    if (!cm.as) throw 'account must be explicitly specified for m cms'

    // CALCULATE FEES
    // const target_tp_index = tpArray.findIndex((tp) => tp.account === cm.as) //Identify who will pay the fee
    // if (target_tp_index !== -1) {
    cm.call = generateCall(cm.contract, cm.entrypoint)

    // const ec_BN = tpArray[target_tp_index].ec_BN
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { delta, call_result: cr } = await make_call_get_delta(
      cm.call,
      cm.args,
      {
        as: cm.as,
        amount: cm.amount,
      }
    )

    //GET PREDICTED COST. FIRST, SET UP FAKE TRANSACTION (TO FAKE SIGN)

    const argumentsAsMicheline = cm.args.map((arg) => (arg as any).to_mich())

    const fake_storage_limit =
      cr.paid_storage_size_diff > 0 ? cr.paid_storage_size_diff : 0

    const completed_transaction: OperationContentsTransaction = {
      kind: OpKind.TRANSACTION,
      source: cm.as.get_address().toString(),
      fee: delta.toString(), //fee here is a placeholder value as this is what we are trying to find
      counter: '1', //placeholder as this value cannot be obtained in mockup tests
      gas_limit: (cr.consumed_gas * 2).toString(),
      storage_limit: (fake_storage_limit * 2).toString(),
      amount: cm.amount.toString(),
      destination: cm.contract.address,
      parameters: {
        entrypoint: cm.entrypoint,
        value: argumentsAsMicheline,
      },
    }

    const op_size = Math.ceil(await compute_op_size(completed_transaction))
    const cost_estimate = await get_cost(
      cr.paid_storage_size_diff,
      cr.consumed_gas,
      op_size
    )

    cm.cost_estimate = cost_estimate

    const delay_seconds = handleDelayInput(cm.delay_after)
    delay_mockup_now_by_second(delay_seconds)
  }
  for (const tp of tpArray) {
    tp.total_cost_estimate = sumCostEstimate(call_makers, tp.account)
    const actual_before = tp.actual_before
    const actual_after = (await tp.account.get_balance()).to_big_number()
    tp.expected_after = actual_before
      .plus(tp.ec_BN)
      .minus(tp.total_cost_estimate)
    const actual_change = actual_after.minus(actual_before)
    const actual_direction = actual_change.isZero()
      ? 'unchanged'
      : actual_change.isPositive()
      ? 'increase'
      : 'decrease'
    const actual_amount = tezBNtoString(posify(actual_change))

    const tolerance = new Tez(150, 'mutez').to_big_number()
    tp.tolerance = tolerance
    tp.actual_after = actual_after
    tp.discrepancy = actual_after.minus(tp.expected_after).abs()

    const actual_string = `\n\tactual: ${actual_direction} by ${actual_amount}`
    const expected_string = `\n\texpected: ${tp.expected_direction} by ${tp.expected_amount}`
    const end_string = `\n\t-----\n`

    const discrepancy_string = !tp.discrepancy.isZero()
      ? `\n\tdiscrepancy: ${tp.discrepancy.toString()} mutez`
      : ''

    const estimated_costs_string = !tp.total_cost_estimate.isZero()
      ? `\n\testimated total costs: ${tp.total_cost_estimate.toString()} mutez`
      : ''

    if (mode == 'verbose') {
      tp.info_message =
        `\n\tSUCCESS: ${tp.account.get_name()}\n\t` +
        expected_string +
        actual_string +
        estimated_costs_string +
        discrepancy_string +
        end_string

      tp.error_message =
        `\n\tERROR: ${tp.account.get_name()}\n\t ` +
        expected_string +
        actual_string +
        estimated_costs_string +
        discrepancy_string +
        end_string
    }
  }
  return tpArray
}

export default run_scenario_test