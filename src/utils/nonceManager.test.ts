import type { Address } from 'abitype'
import { beforeAll, expect, test, vi } from 'vitest'
import { anvilMainnet } from '~test/anvil.js'
import { createRpcProxy } from '~test/utils.js'
import { generatePrivateKey } from '../accounts/generatePrivateKey.js'
import { privateKeyToAccount } from '../accounts/privateKeyToAccount.js'
import {
  dropTransaction,
  getTransaction,
  getTransactionCount,
  mine,
  sendTransaction,
  sendTransactionSync,
  setBalance,
  setCode,
} from '../actions/index.js'
import { mainnet } from '../chains/index.js'
import { createWalletClient } from '../clients/createWalletClient.js'
import { custom } from '../clients/transports/custom.js'
import { http } from '../clients/transports/http.js'
import type { Hex } from '../types/misc.js'
import { defineChain } from './chain/defineChain.js'
import { numberToHex } from './encoding/toHex.js'
import {
  createNonceManager,
  jsonRpc,
  type NonceManager,
  nonceManager,
} from './nonceManager.js'
import { parseTransaction } from './transaction/parseTransaction.js'
import { parseEther } from './unit/parseEther.js'

const privateKey = generatePrivateKey()
const account = privateKeyToAccount(privateKey)

const mainnetClient = anvilMainnet.getClient({ account })

const mainnetArgs = {
  address: account.address,
  chainId: mainnetClient.chain.id,
  client: mainnetClient,
} as const

// A contract that always reverts.
const reverter = privateKeyToAccount(generatePrivateKey()).address

beforeAll(async () => {
  await anvilMainnet.restart()
  await setBalance(mainnetClient, {
    address: account.address,
    value: parseEther('100'),
  })
  await setCode(mainnetClient, {
    address: reverter,
    bytecode: '0x60006000fd',
  })
})

test('get next', async () => {
  const nonceManager = createNonceManager({
    source: jsonRpc(),
  })

  expect(await nonceManager.get(mainnetArgs)).toBe(0)
  await sendTransaction(mainnetClient, {
    to: account.address,
    value: 0n,
  })
  expect(await nonceManager.get(mainnetArgs)).toBe(1)
})

test('consume (sequence)', async () => {
  const nonceManager = createNonceManager({
    source: jsonRpc(),
  })

  const nonce_1 = await nonceManager.consume(mainnetArgs)
  expect(nonce_1).toBe(1)
  const promise_1 = sendTransaction(mainnetClient, {
    to: account.address,
    nonce: nonce_1,
    value: 0n,
  })
  expect(await nonceManager.get(mainnetArgs)).toBe(2)

  const nonce_2 = await nonceManager.consume(mainnetArgs)
  expect(nonce_2).toBe(2)
  const promise_2 = sendTransaction(mainnetClient, {
    to: account.address,
    nonce: nonce_2,
    value: 0n,
  })
  expect(await nonceManager.get(mainnetArgs)).toBe(3)

  const nonce_3 = await nonceManager.consume(mainnetArgs)
  expect(nonce_3).toBe(3)
  const promise_3 = sendTransaction(mainnetClient, {
    to: account.address,
    nonce: nonce_3,
    value: 0n,
  })
  expect(await nonceManager.get(mainnetArgs)).toBe(4)

  const [hash_1, hash_2, hash_3] = await Promise.all([
    promise_1,
    promise_2,
    promise_3,
  ])

  expect((await getTransaction(mainnetClient, { hash: hash_1 })).nonce).toBe(1)
  expect((await getTransaction(mainnetClient, { hash: hash_2 })).nonce).toBe(2)
  expect((await getTransaction(mainnetClient, { hash: hash_3 })).nonce).toBe(3)
  expect(await nonceManager.get(mainnetArgs)).toBe(4)

  const nonce_4 = await nonceManager.consume(mainnetArgs)
  expect(nonce_4).toBe(4)
  const hash_4 = await sendTransaction(mainnetClient, {
    to: account.address,
    nonce: nonce_4,
    value: 0n,
  })
  expect((await getTransaction(mainnetClient, { hash: hash_4 })).nonce).toBe(4)

  expect(await nonceManager.get(mainnetArgs)).toBe(5)
})

test('consume (parallel)', async () => {
  const nonceManager = createNonceManager({
    source: jsonRpc(),
  })

  const [n_1, nonce_1, n_2, nonce_2, n_3, nonce_3, n_4] = await Promise.all([
    nonceManager.get(mainnetArgs),
    nonceManager.consume(mainnetArgs),
    nonceManager.get(mainnetArgs),
    nonceManager.consume(mainnetArgs),
    nonceManager.get(mainnetArgs),
    nonceManager.consume(mainnetArgs),
    nonceManager.get(mainnetArgs),
  ])

  expect(n_1).toBe(5)
  expect(nonce_1).toBe(5)
  expect(n_2).toBe(6)
  expect(nonce_2).toBe(6)
  expect(n_3).toBe(7)
  expect(nonce_3).toBe(7)
  expect(n_4).toBe(8)

  const [hash_1, hash_2, hash_3] = await Promise.all([
    sendTransaction(mainnetClient, {
      to: account.address,
      nonce: nonce_1,
      value: 0n,
    }),
    sendTransaction(mainnetClient, {
      to: account.address,
      nonce: nonce_2,
      value: 0n,
    }),
    sendTransaction(mainnetClient, {
      to: account.address,
      nonce: nonce_3,
      value: 0n,
    }),
  ])

  expect((await getTransaction(mainnetClient, { hash: hash_1 })).nonce).toBe(5)
  expect((await getTransaction(mainnetClient, { hash: hash_2 })).nonce).toBe(6)
  expect((await getTransaction(mainnetClient, { hash: hash_3 })).nonce).toBe(7)
  expect(await nonceManager.get(mainnetArgs)).toBe(8)

  const nonce_4 = await nonceManager.consume(mainnetArgs)
  expect(nonce_4).toBe(8)
  const hash_4 = await sendTransaction(mainnetClient, {
    to: account.address,
    nonce: nonce_4,
    value: 0n,
  })
  expect((await getTransaction(mainnetClient, { hash: hash_4 })).nonce).toBe(8)
  expect(await nonceManager.get(mainnetArgs)).toBe(9)
})

test('nonceManager export', async () => {
  expect(await nonceManager.get(mainnetArgs)).toBe(9)
  expect(await nonceManager.consume(mainnetArgs)).toBe(9)
  expect(await nonceManager.get(mainnetArgs)).toBe(10)

  const nonces = await Promise.all([
    nonceManager.consume(mainnetArgs),
    nonceManager.get(mainnetArgs),
    nonceManager.consume(mainnetArgs),
    nonceManager.get(mainnetArgs),
    nonceManager.consume(mainnetArgs),
    nonceManager.get(mainnetArgs),
  ])
  expect(nonces).toMatchInlineSnapshot(`
    [
      10,
      11,
      11,
      12,
      12,
      13,
    ]
  `)
})

test('reset clears consumed nonce cache', async () => {
  const nonceManager = createNonceManager({
    source: {
      get: () => 1,
      set: () => {},
    },
  })

  expect(await nonceManager.consume(mainnetArgs)).toBe(1)

  nonceManager.reset(mainnetArgs)

  expect(await nonceManager.consume(mainnetArgs)).toBe(1)
})

test('get preserves consumed nonce cache', async () => {
  const nonceManager = createNonceManager({
    source: {
      get: () => 1,
      set: () => {},
    },
  })

  expect(await nonceManager.consume(mainnetArgs)).toBe(1)
  expect(await nonceManager.get(mainnetArgs)).toBe(2)
  expect(await nonceManager.consume(mainnetArgs)).toBe(2)
})

test('consumed nonce 0 is not re-served by a stale source', async () => {
  const nonceManager = createNonceManager({
    source: {
      get: () => 0,
      set: () => {},
    },
  })

  expect(await nonceManager.consume(mainnetArgs)).toBe(0)
  expect(await nonceManager.get(mainnetArgs)).toBe(1)
  expect(await nonceManager.consume(mainnetArgs)).toBe(1)
})

test('reset with a nonce releases only that nonce', async () => {
  // The source leaves out nonces that still wait for a block.
  const nonceManager = createNonceManager({
    source: {
      get: () => 0,
      set: () => {},
    },
  })
  for (let i = 0; i < 4; i++) await nonceManager.consume(mainnetArgs)
  nonceManager.reset({ ...mainnetArgs, nonce: 2 })
  nonceManager.reset({ ...mainnetArgs, nonce: 1 })

  // Consumes take released nonces first, lowest first, and only once.
  const nonces = await Promise.all([
    nonceManager.get(mainnetArgs),
    nonceManager.consume(mainnetArgs),
    nonceManager.consume(mainnetArgs),
    nonceManager.consume(mainnetArgs),
    nonceManager.get(mainnetArgs),
  ])
  nonces.push(await nonceManager.consume(mainnetArgs))

  expect(nonces).toMatchInlineSnapshot(`
    [
      1,
      1,
      2,
      4,
      5,
      5,
    ]
  `)
})

test('reset with a nonce the source has passed', async () => {
  let next = 0
  const nonceManager = createNonceManager({
    source: {
      get: () => next,
      set: () => {},
    },
  })
  for (let i = 0; i < 3; i++) await nonceManager.consume(mainnetArgs)
  nonceManager.reset({ ...mainnetArgs, nonce: 1 })

  // The failed send reached the node after all.
  next = 2

  expect(await nonceManager.consume(mainnetArgs)).toBe(3)
})

test('reset ignores a nonce it did not hand out or already released', async () => {
  const nonceManager = createNonceManager({
    source: {
      get: () => 0,
      set: () => {},
    },
  })
  await nonceManager.consume(mainnetArgs)
  await nonceManager.consume(mainnetArgs)

  nonceManager.reset({ ...mainnetArgs, nonce: 5 })
  nonceManager.reset({ ...mainnetArgs, nonce: 0 })
  nonceManager.reset({ ...mainnetArgs, nonce: 0 })
  const nonces = [
    await nonceManager.consume(mainnetArgs),
    await nonceManager.consume(mainnetArgs),
  ]

  expect(nonces).toMatchInlineSnapshot(`
    [
      0,
      2,
    ]
  `)
})

test('failed sendTransaction resets consumed nonce', async () => {
  const nonceManager = createNonceManager({
    source: jsonRpc(),
  })
  const account = privateKeyToAccount(privateKey, { nonceManager })
  const client = createWalletClient({
    chain: mainnet,
    transport: custom({
      async request({ method }) {
        if (method === 'eth_getTransactionCount') return '0x1'
        if (method === 'eth_sendRawTransaction')
          throw new Error('rate limit exceeded')
        return '0x0'
      },
    }),
  })

  await expect(
    sendTransaction(client, {
      account,
      gas: 21_000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      to: account.address,
      value: 1n,
    }),
  ).rejects.toThrow()

  expect(
    await nonceManager.consume({
      address: account.address,
      chainId: mainnet.id,
      client,
    }),
  ).toBe(1)
})

test('failed sendTransactionSync resets consumed nonce', async () => {
  const nonceManager = createNonceManager({
    source: jsonRpc(),
  })
  const account = privateKeyToAccount(privateKey, { nonceManager })
  const client = createWalletClient({
    chain: mainnet,
    transport: custom({
      async request({ method }) {
        if (method === 'eth_getTransactionCount') return '0x1'
        if (method === 'eth_sendRawTransactionSync')
          throw new Error('rate limit exceeded')
        return '0x0'
      },
    }),
  })

  await expect(
    sendTransactionSync(client, {
      account,
      gas: 21_000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      to: account.address,
      value: 1n,
    }),
  ).rejects.toThrow()

  expect(
    await nonceManager.consume({
      address: account.address,
      chainId: mainnet.id,
      client,
    }),
  ).toBe(1)
})

test('failed sendTransaction resets without a nonce when consume throws', async () => {
  type Reset = Parameters<NonceManager['reset']>[0]
  const resets: Reset[] = []
  const nonceManager: NonceManager = {
    async consume() {
      throw new Error('source unavailable')
    },
    async get() {
      return 0
    },
    increment() {},
    reset(parameters) {
      resets.push(parameters)
    },
  }
  const account = privateKeyToAccount(privateKey, { nonceManager })
  const client = createWalletClient({
    chain: mainnet,
    transport: custom({
      async request() {
        return '0x0'
      },
    }),
  })

  await expect(
    sendTransaction(client, {
      account,
      gas: 21_000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      to: account.address,
      value: 1n,
    }),
  ).rejects.toThrow()

  expect(resets.map(({ address: _, ...rest }) => rest)).toMatchInlineSnapshot(`
    [
      {
        "chainId": 1,
      },
    ]
  `)
})

test('failed sendTransaction releases only its consumed nonce', async () => {
  const free: number[] = []
  let next = 5
  const nonceManager: NonceManager = {
    async consume() {
      return free.shift() ?? next++
    },
    async get() {
      return free[0] ?? next
    },
    increment() {},
    reset({ nonce }) {
      if (typeof nonce === 'number') free.push(nonce)
    },
  }
  const account = privateKeyToAccount(privateKey, { nonceManager })
  const broadcasts: number[] = []
  const client = createWalletClient({
    chain: mainnet,
    transport: custom({
      async request({ method, params }) {
        if (method !== 'eth_sendRawTransaction') return '0x0'
        const { nonce } = parseTransaction((params as [Hex])[0])
        broadcasts.push(nonce!)
        if (nonce === 6 && broadcasts.length < 4)
          throw new Error('rate limit exceeded')
        return `0x${'00'.repeat(32)}`
      },
    }),
  })
  const send = () =>
    sendTransaction(client, {
      account,
      gas: 21_000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      to: account.address,
      value: 1n,
    })

  const results = await Promise.allSettled([send(), send(), send()])
  await send()

  expect({
    broadcasts,
    statuses: results.map(({ status }) => status),
  }).toMatchInlineSnapshot(`
    {
      "broadcasts": [
        5,
        6,
        7,
        6,
      ],
      "statuses": [
        "fulfilled",
        "rejected",
        "fulfilled",
      ],
    }
  `)
})

test('failed sendTransactionSync resets without a nonce when consume throws', async () => {
  type Reset = Parameters<NonceManager['reset']>[0]
  const resets: Reset[] = []
  const nonceManager: NonceManager = {
    async consume() {
      throw new Error('source unavailable')
    },
    async get() {
      return 0
    },
    increment() {},
    reset(parameters) {
      resets.push(parameters)
    },
  }
  const account = privateKeyToAccount(privateKey, { nonceManager })
  const client = createWalletClient({
    chain: mainnet,
    transport: custom({
      async request() {
        return '0x0'
      },
    }),
  })

  await expect(
    sendTransactionSync(client, {
      account,
      gas: 21_000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      to: account.address,
      value: 1n,
    }),
  ).rejects.toThrow()

  expect(resets.map(({ address: _, ...rest }) => rest)).toMatchInlineSnapshot(`
    [
      {
        "chainId": 1,
      },
    ]
  `)
})

test('failed sendTransactionSync releases its consumed nonce', async () => {
  const free: number[] = []
  let next = 5
  const nonceManager: NonceManager = {
    async consume() {
      return free.shift() ?? next++
    },
    async get() {
      return free[0] ?? next
    },
    increment() {},
    reset({ nonce }) {
      if (typeof nonce === 'number') free.push(nonce)
    },
  }
  const account = privateKeyToAccount(privateKey, { nonceManager })
  const broadcasts: number[] = []
  const client = createWalletClient({
    chain: mainnet,
    transport: custom({
      async request({ method, params }) {
        if (method !== 'eth_sendRawTransactionSync') return '0x0'
        const { nonce } = parseTransaction((params as [Hex])[0])
        broadcasts.push(nonce!)
        throw new Error('rate limit exceeded')
      },
    }),
  })
  const send = () =>
    sendTransactionSync(client, {
      account,
      gas: 21_000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      to: account.address,
      value: 1n,
    })

  await expect(send()).rejects.toThrow()
  await expect(send()).rejects.toThrow()

  expect(broadcasts).toMatchInlineSnapshot(`
    [
      5,
      5,
    ]
  `)
})

test('failed sendTransaction does not reset an unconsumed nonce', async () => {
  const nonceManager = createNonceManager({
    source: {
      get: () => 1,
      set: () => {},
    },
  })
  const consume = vi.spyOn(nonceManager, 'consume')
  const reset = vi.spyOn(nonceManager, 'reset')
  const account = privateKeyToAccount(privateKey, { nonceManager })
  const chain = defineChain({
    ...mainnet,
    async prepareTransactionRequest(request) {
      return { ...request, nonce: 1 }
    },
  })
  const client = createWalletClient({
    chain,
    transport: custom({
      async request({ method }) {
        if (method === 'eth_sendRawTransaction')
          throw new Error('rate limit exceeded')
        return '0x0'
      },
    }),
  })

  await expect(
    sendTransaction(client, {
      account,
      chainId: chain.id,
      gas: 21_000n,
      gasPrice: 1n,
      to: account.address,
      type: 'legacy',
      value: 1n,
    }),
  ).rejects.toThrow()

  expect(consume).not.toHaveBeenCalled()
  expect(reset).not.toHaveBeenCalled()
})

test('failed sendTransactionSync does not reset an unconsumed nonce', async () => {
  const nonceManager = createNonceManager({
    source: {
      get: () => 1,
      set: () => {},
    },
  })
  const consume = vi.spyOn(nonceManager, 'consume')
  const reset = vi.spyOn(nonceManager, 'reset')
  const account = privateKeyToAccount(privateKey, { nonceManager })
  const chain = defineChain({
    ...mainnet,
    async prepareTransactionRequest(request) {
      return { ...request, nonce: 1 }
    },
  })
  const client = createWalletClient({
    chain,
    transport: custom({
      async request({ method }) {
        if (method === 'eth_sendRawTransactionSync')
          throw new Error('rate limit exceeded')
        return '0x0'
      },
    }),
  })

  await expect(
    sendTransactionSync(client, {
      account,
      chainId: chain.id,
      gas: 21_000n,
      gasPrice: 1n,
      to: account.address,
      type: 'legacy',
      value: 1n,
    }),
  ).rejects.toThrow()

  expect(consume).not.toHaveBeenCalled()
  expect(reset).not.toHaveBeenCalled()
})

test('dropped tx', async () => {
  const nonceManager = createNonceManager({
    source: jsonRpc(),
  })

  const args = {
    address: account.address,
    chainId: mainnetClient.chain.id,
    client: mainnetClient,
  }

  const nonce_1 = await nonceManager.consume(args)
  expect(nonce_1).toBe(9)
  const hash_1 = await sendTransaction(mainnetClient, {
    account,
    to: account.address,
    nonce: nonce_1,
    value: 0n,
  })
  expect(await nonceManager.get(args)).toBe(10)

  const nonce_2 = await nonceManager.consume(args)
  expect(nonce_2).toBe(10)
  const hash_2 = await sendTransaction(mainnetClient, {
    account,
    to: account.address,
    nonce: nonce_2,
    value: 0n,
  })
  expect(await nonceManager.get(args)).toBe(11)

  await dropTransaction(mainnetClient, { hash: hash_1 })
  await dropTransaction(mainnetClient, { hash: hash_2 })

  const nonce_3 = await nonceManager.consume(args)
  expect(nonce_3).toBe(9)
  await sendTransaction(mainnetClient, {
    account,
    to: account.address,
    nonce: nonce_3,
    value: 0n,
  })
  expect(await nonceManager.get(args)).toBe(10)
})

test('failed send while a parallel send prepares', async () => {
  const nonceManager = createNonceManager({ source: jsonRpc() })
  const account = privateKeyToAccount(generatePrivateKey(), { nonceManager })
  await setBalance(mainnetClient, {
    address: account.address,
    value: parseEther('1'),
  })
  const client = anvilMainnet.getClient({ account })
  // A parallel send that has its nonce but has not reached the node yet.
  const nonce = await nonceManager.consume({
    address: account.address,
    chainId: client.chain.id,
    client,
  })

  await expect(sendTransaction(client, { to: reverter })).rejects.toThrow()
  // Takes the nonce that the failed send released, not the parallel send's.
  const hash_2 = await sendTransaction(client, {
    to: account.address,
    value: 1n,
  })
  const hash_1 = await sendTransaction(client, {
    nonce,
    to: account.address,
    value: 0n,
  })
  await mine(mainnetClient, { blocks: 1 })

  const nonces = await Promise.all(
    [hash_1, hash_2].map(
      async (hash) => (await getTransaction(mainnetClient, { hash })).nonce,
    ),
  )
  expect(nonces).toMatchInlineSnapshot(`
    [
      0,
      1,
    ]
  `)
})

test('failed send on a node that leaves sent transactions out of the pending nonce', async () => {
  // Such as Arbitrum or Monad: the `pending` nonce only counts transactions in
  // blocks, and the test node mines only when asked.
  const url = await createRpcProxy(
    anvilMainnet.rpcUrl.http,
    async ({ method, params }) => {
      if (method !== 'eth_getTransactionCount') return undefined
      const count = await getTransactionCount(mainnetClient, {
        address: params[0] as Address,
        blockTag: 'latest',
      })
      return { result: numberToHex(count) }
    },
  )
  const account = privateKeyToAccount(generatePrivateKey(), {
    nonceManager: createNonceManager({ source: jsonRpc() }),
  })
  await setBalance(mainnetClient, {
    address: account.address,
    value: parseEther('1'),
  })
  const client = createWalletClient({
    account,
    chain: mainnet,
    transport: http(url),
  })

  const hash_1 = await sendTransaction(client, {
    to: account.address,
    value: 0n,
  })
  await expect(sendTransaction(client, { to: reverter })).rejects.toThrow()
  const hash_2 = await sendTransaction(client, {
    to: account.address,
    value: 1n,
  })
  await mine(mainnetClient, { blocks: 1 })

  const nonces = await Promise.all(
    [hash_1, hash_2].map(
      async (hash) => (await getTransaction(mainnetClient, { hash })).nonce,
    ),
  )
  expect(nonces).toMatchInlineSnapshot(`
    [
      0,
      1,
    ]
  `)
})

test('failed send in a burst on a node that rejects nonce gaps', async () => {
  // Such as Arbitrum: the `pending` nonce only counts transactions in blocks,
  // and the node rejects a nonce above the account's next one.
  const account = privateKeyToAccount(generatePrivateKey(), {
    nonceManager: createNonceManager({ source: jsonRpc() }),
  })
  await setBalance(mainnetClient, {
    address: account.address,
    value: parseEther('1'),
  })
  const url = await createRpcProxy(
    anvilMainnet.rpcUrl.http,
    async ({ method, params }) => {
      if (method === 'eth_getTransactionCount') {
        const count = await getTransactionCount(mainnetClient, {
          address: params[0] as Address,
          blockTag: 'latest',
        })
        return { result: numberToHex(count) }
      }
      if (method !== 'eth_sendRawTransaction') return undefined
      const { nonce } = parseTransaction(params[0] as Hex)
      const next = await getTransactionCount(mainnetClient, {
        address: account.address,
        blockTag: 'pending',
      })
      if (nonce! <= next) return undefined
      return { error: { code: -32000, message: 'nonce too high' } }
    },
  )
  const client = createWalletClient({
    account,
    chain: mainnet,
    transport: http(url),
  })

  // The second send fails, so the node rejects the third as too high.
  const [hash_1] = await Promise.all([
    sendTransaction(client, { to: account.address, value: 0n }),
    expect(sendTransaction(client, { to: reverter })).rejects.toThrow(),
    expect(
      sendTransaction(client, { to: account.address, value: 1n }),
    ).rejects.toThrow('higher than the next one expected'),
  ])
  // Take the released nonces, not the first send's.
  const hash_2 = await sendTransaction(client, {
    to: account.address,
    value: 2n,
  })
  const hash_3 = await sendTransaction(client, {
    to: account.address,
    value: 3n,
  })
  await mine(mainnetClient, { blocks: 1 })

  const nonces = await Promise.all(
    [hash_1, hash_2, hash_3].map(
      async (hash) => (await getTransaction(mainnetClient, { hash })).nonce,
    ),
  )
  expect(nonces).toMatchInlineSnapshot(`
    [
      0,
      1,
      2,
    ]
  `)
})
