import { TokenId } from 'viem/tempo'
import { describe, expect, test } from 'vitest'

describe('from', () => {
  test('behavior: number', () => {
    expect(TokenId.from(0)).toMatchInlineSnapshot(`0n`)
    expect(TokenId.from(1)).toMatchInlineSnapshot(`1n`)
  })

  test('behavior: bigint', () => {
    expect(TokenId.from(42n)).toMatchInlineSnapshot(`42n`)
  })

  test('behavior: TIP-20 address', () => {
    expect(
      TokenId.from('0x20c0000000000000000000000000000000000001'),
    ).toMatchInlineSnapshot(`1n`)
  })

  test('error: invalid address', () => {
    expect(() =>
      TokenId.from('0x0000000000000000000000000000000000000001'),
    ).toThrowErrorMatchingInlineSnapshot(`[Error: invalid tip20 address.]`)
  })
})

describe('fromAddress', () => {
  test('behavior: extracts token id', () => {
    expect(
      TokenId.fromAddress('0x20C0000000000000000000000000000000000002'),
    ).toMatchInlineSnapshot(`2n`)
  })

  test('behavior: round-trips >112-bit token id', () => {
    const tokenId = (1n << 120n) + 42n
    const address = TokenId.toAddress(tokenId)
    expect(address).toMatchInlineSnapshot(
      `"0x20c000000100000000000000000000000000002a"`,
    )
    expect(TokenId.fromAddress(address)).toBe(tokenId)
  })

  test('error: non-TIP-20 address', () => {
    expect(() =>
      TokenId.fromAddress('0xdeadbeef00000000000000000000000000000001'),
    ).toThrowErrorMatchingInlineSnapshot(`[Error: invalid tip20 address.]`)
  })
})

describe('toAddress', () => {
  test('behavior: token id to TIP-20 address', () => {
    expect(TokenId.toAddress(0n)).toMatchInlineSnapshot(
      `"0x20c0000000000000000000000000000000000000"`,
    )
    expect(TokenId.toAddress(1n)).toMatchInlineSnapshot(
      `"0x20c0000000000000000000000000000000000001"`,
    )
  })

  test('behavior: address passthrough', () => {
    expect(
      TokenId.toAddress('0x20c0000000000000000000000000000000000001'),
    ).toMatchInlineSnapshot(`"0x20c0000000000000000000000000000000000001"`)
  })

  test('behavior: tempo address resolution', () => {
    expect(
      TokenId.toAddress('tempox0x20c0000000000000000000000000000000000001'),
    ).toMatchInlineSnapshot(`"0x20C0000000000000000000000000000000000001"`)
  })

  test('error: out of bounds token id', () => {
    expect(() => TokenId.toAddress(-1n)).toThrow()
    expect(() => TokenId.toAddress(2n ** 144n)).toThrow()
  })
})

describe('compute', () => {
  test('behavior: deterministic token id from sender and salt', () => {
    expect(
      TokenId.compute({
        sender: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        salt: '0x0000000000000000000000000000000000000000000000000000000000000001',
      }),
    ).toMatchInlineSnapshot(`11799755700385099341n`)
  })
})
