import type { Address } from 'abitype'

import { getTransactionCount } from '../actions/public/getTransactionCount.js'
import type { Client } from '../clients/createClient.js'
import type { MaybePromise } from '../types/utils.js'
import { LruMap } from './lru.js'

export type CreateNonceManagerParameters = {
  source: NonceManagerSource
}

type FunctionParameters = {
  address: Address
  chainId: number
}

type ResetParameters = FunctionParameters & {
  /**
   * The nonce that `consume` returned for the send being reset.
   *
   * Set when a send fails after `consume` returned a nonce, and omitted
   * when `consume` threw or `reset` is called outside of a send. Managers
   * that track a nonce per send can use it to release that nonce only.
   *
   * A failed send does not prove the nonce is unused: the node may have
   * accepted the transaction before the request failed (e.g. a timeout).
   * Check the account's pending nonce before reusing a released nonce.
   */
  nonce?: number | undefined
}

export type NonceManager = {
  /** Get and increment a nonce. */
  consume: (
    parameters: FunctionParameters & { client: Client },
  ) => Promise<number>
  /** Increment a nonce. */
  increment: (chainId: FunctionParameters) => void
  /** Get a nonce. */
  get: (chainId: FunctionParameters & { client: Client }) => Promise<number>
  /** Reset a nonce. */
  reset: (chainId: ResetParameters) => void
}

/**
 * Creates a nonce manager for auto-incrementing transaction nonces.
 *
 * - Docs: https://viem.sh/docs/accounts/createNonceManager
 *
 * @example
 * ```ts
 * const nonceManager = createNonceManager({
 *   source: jsonRpc(),
 * })
 * ```
 */
export function createNonceManager(
  parameters: CreateNonceManagerParameters,
): NonceManager {
  const { source } = parameters

  const deltaMap = new Map()
  // The highest nonce handed out, and the lower nonces of failed sends (in
  // ascending order) to hand out again.
  type Entry = { nonce: number; released: readonly number[] }
  const nonceMap = new LruMap<Entry>(8192)
  // The next new nonce, and the released nonces to hand out before it.
  type Batch = { nonce: number; released: readonly number[] }
  const promiseMap = new Map<string, Promise<Batch>>()

  const getKey = ({ address, chainId }: FunctionParameters) =>
    `${address}.${chainId}`
  const resetCache = (key: string) => {
    deltaMap.delete(key)
    promiseMap.delete(key)
  }

  return {
    async consume({ address, chainId, client }) {
      const key = getKey({ address, chainId })
      const promise = this.get({ address, chainId, client })

      this.increment({ address, chainId })
      const nonce = await promise

      await source.set({ address, chainId }, nonce)
      // A released nonce is lower than the highest one handed out.
      const previous = nonceMap.get(key)
      if (!previous || nonce > previous.nonce)
        nonceMap.set(key, { nonce, released: previous?.released ?? [] })

      return nonce
    },
    async increment({ address, chainId }) {
      const key = getKey({ address, chainId })
      const delta = deltaMap.get(key) ?? 0
      deltaMap.set(key, delta + 1)
    },
    async get({ address, chainId, client }) {
      const key = getKey({ address, chainId })

      let promise = promiseMap.get(key)
      if (!promise) {
        promise = (async () => {
          try {
            const nonce = await source.get({ address, chainId, client })
            const previous = nonceMap.get(key)
            if (previous && nonce <= previous.nonce) {
              // Released nonces below the source's nonce were used after all.
              const released = previous.released.filter((n) => n >= nonce)
              // The consumes waiting on this read take the released nonces
              // first, so a later read cannot hand them out again.
              const count = deltaMap.get(key) ?? 0
              nonceMap.set(key, {
                ...previous,
                released: released.slice(count),
              })
              return { nonce: previous.nonce + 1, released }
            }
            nonceMap.delete(key)
            return { nonce, released: [] }
          } finally {
            resetCache(key)
          }
        })()
        promiseMap.set(key, promise)
      }

      const delta = deltaMap.get(key) ?? 0
      const { nonce, released } = await promise
      return released[delta] ?? nonce + delta - released.length
    },
    reset({ address, chainId, nonce }) {
      const key = getKey({ address, chainId })

      // Release only the failed send's nonce. The node's `pending` nonce can
      // leave out the others handed out: a parallel send may not have reached
      // it yet, and some nodes count a transaction only once it is in a block
      // (e.g. Arbitrum, Monad).
      if (typeof nonce === 'number') {
        const previous = nonceMap.get(key)
        if (!previous || nonce > previous.nonce) return
        if (previous.released.includes(nonce)) return
        nonceMap.set(key, {
          ...previous,
          released: [...previous.released, nonce].sort((a, b) => a - b),
        })
        return
      }

      nonceMap.delete(key)
      resetCache(key)
    },
  }
}

////////////////////////////////////////////////////////////////////////////////////////////
// Sources

export type NonceManagerSource = {
  /** Get a nonce. */
  get(parameters: FunctionParameters & { client: Client }): MaybePromise<number>
  /** Set a nonce. */
  set(parameters: FunctionParameters, nonce: number): MaybePromise<void>
}

/** JSON-RPC source for a nonce manager. */
export function jsonRpc(): NonceManagerSource {
  return {
    async get(parameters) {
      const { address, client } = parameters
      return getTransactionCount(client, {
        address,
        blockTag: 'pending',
      })
    },
    set() {},
  }
}

////////////////////////////////////////////////////////////////////////////////////////////
// Default

/** Default Nonce Manager with a JSON-RPC source. */
export const nonceManager = /*#__PURE__*/ createNonceManager({
  source: jsonRpc(),
})
