---
"viem": patch
---

Fixed `nonceManager` giving the next send a nonce still in use after a send failed, when sends ran in parallel or on nodes that do not count transactions until they are in a block (such as Arbitrum, HyperEVM and Monad); a send that fails after getting its nonce now gives back only that nonce, so call `reset` without `nonce` after a dropped transaction.
