---
"viem": patch
---

Fixed `waitForTransactionReceipt` returning late when the node does not return pending transactions, and made it check for the receipt at least once per block.
