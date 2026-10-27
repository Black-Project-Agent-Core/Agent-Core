---
"agent-core": patch
---

Controller contract receipts no longer expire after 30 idle minutes. A receipt now ends only on a contract edit, a server restart or least-recently-used eviction (128 retained receipts), and each use moves it to the most-recent end so an active chat is not evicted by other chats' reads.
