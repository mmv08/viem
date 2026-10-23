---
"viem": patch
---

Fixed `watchEvent` and `watchContractEvent` on RPCs without filter support sending logs twice, sending logs from before `fromBlock`, or reporting an invalid block range when the block number went down or `fromBlock` was still in the future; they now wait for the block number to catch up.
