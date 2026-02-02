# Changelog

## [0.2.2](https://github.com/googleapis/mcp-toolbox-sdk-js/compare/v0.1.2...v0.2.2) (2026-02-02)


### ⚠ BREAKING CHANGES

* add MCP support ([#196](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/196))

### Features

* Add load toolset method ([#17](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/17)) ([2449b18](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/2449b186778090bf0e3a352a08f961de584208bc))
* add MCP support ([#196](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/196)) ([35e7fef](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/35e7fef4c389c14adb117e60ea7541ed475646d9))
* Add support for map parameter type ([#78](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/78)) ([5de08c1](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/5de08c10368ffe67ccb776ecda6cdab0a1a76484))
* Added basic tool and client with loadTool() ([#12](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/12)) ([cc6072b](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/cc6072bf7f5e4d8a74c87b7e3900ec6f6e3179db))
* Added toolbox protocol ([#7](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/7)) ([35822b2](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/35822b22ea423e7c1a514f1ab8240b320bf0f14f))
* Adds test case for auth token getter and client header conflict ([#103](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/103)) ([b5941a5](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/b5941a54e0c4976a0712a0d3e4253005e2759fa3))
* allow users to import via the require syntax ([#55](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/55)) ([41144e5](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/41144e5697b17f452ee5b8efd01bc4bbecca1b91))
* cache id tokens for client headers ([#60](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/60)) ([952013a](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/952013a43e5e6afae262cc3194f906383b475c7d))
* initialise package ([519874c](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/519874c962d8ab7e35cad6ea2fa1b0b6b05a25d8))
* **mcp:** add MCP v20251125 ([#206](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/206)) ([ef630da](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/ef630da8d07dd260f24ea57a14b4c18e3b65b2d3))
* **toolbox-core:** Add auth token getters ([#38](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/38)) ([6611291](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/661129160801f7f89de4fe7920017b4b23524ab7))
* **toolbox-core:** add bound params ([#25](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/25)) ([5238fca](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/5238fca1321a13aaf20b1958fbf4422d6d563968))
* **toolbox-core:** add client headers ([#23](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/23)) ([edb347c](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/edb347c7256dbd4434ad4e8b52ba71c53351b80a))
* **toolbox-core:** Add helper methods for retrieving Google ID Tokens ([#41](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/41)) ([794f40a](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/794f40a98e59d902b2593e2f26182aaf72c88923))
* **toolbox-core:** Add support for optional parameters ([#66](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/66)) ([bfbc4f6](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/bfbc4f66d62688aee2754a2ef73d78af5c075306))


### Bug Fixes

* **deps:** update dependency google-auth-library to v10 ([#45](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/45)) ([fb3d4aa](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/fb3d4aa34f61b5c8a22c25ae9f7d686e23bc4c10))
* **deps:** update dependency zod to v4 ([#67](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/67)) ([f1dc8f1](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/f1dc8f19c6160abfa5d40f1cafa4390ed6603f86))
* import @toolbox/core into other packages ([#31](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/31)) ([26839ee](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/26839ee5653eb35140b467116d32ed9a59ff2211))
* make tools return strings ([#57](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/57)) ([c238aa1](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/c238aa1b55c27dc8ebb2dcd54caf861c152c61c9))
* **mcp:** merge multiple JSON objects in MCP tool output ([#205](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/205)) ([34cdd43](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/34cdd4348310ca2b93a194f9395592579fda6b2f))
* remove support for nested maps ([#92](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/92)) ([93a8193](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/93a81931a62a1f9e79290da20359c3242404d561))
* **toolbox-core:** fix config to build in the right place ([#27](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/27)) ([1867a97](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/1867a975dbf9c9561511e4c854da047810fe0b51))
* **toolbox-core:** Simplify tool invocation response handling ([#69](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/69)) ([c7dce48](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/c7dce4844462ddf415872257c217808791ad5e9a))
* update clean scripts ([#230](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/230)) ([5f7d200](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/5f7d2004a313af3b4a5ed7a726674e6d3825ebc8))


### Miscellaneous Chores

* release 0.1.5 ([#174](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/174)) ([7ecfe4c](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/7ecfe4cac6f63b266b6cbe2ac2e8c51cbf5cc07d))
* release main ([#158](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/158)) ([3dcb014](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/3dcb014ac26e5b6b05f6256c36ee443b78cd4e0f))
* release main ([#51](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/51)) ([d3edcd7](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/d3edcd7d5fb49fb02a77177f8a898b961a6fe09e))

## [0.2.1](https://github.com/googleapis/mcp-toolbox-sdk-js/compare/core-v0.1.5...core-v0.2.1) (2026-01-29)


### ⚠ BREAKING CHANGES

* add MCP support ([#196](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/196))

### Features

* add MCP support ([#196](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/196)) ([35e7fef](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/35e7fef4c389c14adb117e60ea7541ed475646d9))
* **mcp:** add MCP v20251125 ([#206](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/206)) ([ef630da](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/ef630da8d07dd260f24ea57a14b4c18e3b65b2d3))


### Bug Fixes

* **mcp:** merge multiple JSON objects in MCP tool output ([#205](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/205)) ([34cdd43](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/34cdd4348310ca2b93a194f9395592579fda6b2f))


## [0.1.5](https://github.com/googleapis/mcp-toolbox-sdk-js/compare/core-v0.1.2...core-v0.1.5) (2025-12-03)

### Miscellaneous Chores

* export additional types from toolbox-core ([#116](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/116)) ([6ace767](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/6ace76785bc8161e083b1539fd86d51ea4f07724))

## [0.1.2](https://github.com/googleapis/mcp-toolbox-sdk-js/compare/core-v0.1.1...core-v0.1.2) (2025-08-19)


### Features

* Add support for map parameter type ([#78](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/78)) ([5de08c1](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/5de08c10368ffe67ccb776ecda6cdab0a1a76484))


### Bug fixes

* Revert back zod version to v3 ([#88](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/88)) ([6163c34](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/6163c340c577926b5f2d5607abde5e2c1131ee59))


### Documentation

* Add note regarding local testing ([#89](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/89)) ([6ed5348](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/6ed53481a89d459c057352c7db237326dd10b35f))
* fix method name ([#76](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/76)) ([6f18e99](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/6f18e99242533a0313c8c27206127b22927626d2))
* improve contributor guidance ([#72](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/72)) ([7012e0a](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/7012e0a477872db6e68a535a67acb772ed6ca2e1))

## [0.1.1](https://github.com/googleapis/mcp-toolbox-sdk-js/compare/core-v0.1.0...core-v0.1.1) (2025-07-17)


### Features

* **toolbox-core:** Add support for optional parameters ([#66](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/66)) ([bfbc4f6](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/bfbc4f66d62688aee2754a2ef73d78af5c075306))


### Bug Fixes

* **toolbox-core:** Simplify tool invocation response handling ([#69](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/69)) ([c7dce48](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/c7dce4844462ddf415872257c217808791ad5e9a))

## 0.1.0 (2025-06-23)


### Features

* **toolbox-core:** Add load toolset method ([#17](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/17)) ([2449b18](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/2449b186778090bf0e3a352a08f961de584208bc))
* **toolbox-core:** Added basic tool and client with loadTool() ([#12](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/12)) ([cc6072b](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/cc6072bf7f5e4d8a74c87b7e3900ec6f6e3179db))
* **toolbox-core:** Added toolbox protocol ([#7](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/7)) ([35822b2](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/35822b22ea423e7c1a514f1ab8240b320bf0f14f))
* **toolbox-core:** allow users to import via the require syntax ([#55](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/55)) ([41144e5](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/41144e5697b17f452ee5b8efd01bc4bbecca1b91))
* **toolbox-core:** cache id tokens for client headers ([#60](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/60)) ([952013a](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/952013a43e5e6afae262cc3194f906383b475c7d))
* **toolbox-core:** Add auth token getters ([#38](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/38)) ([6611291](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/661129160801f7f89de4fe7920017b4b23524ab7))
* **toolbox-core:** add bound params ([#25](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/25)) ([5238fca](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/5238fca1321a13aaf20b1958fbf4422d6d563968))
* **toolbox-core:** add client headers ([#23](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/23)) ([edb347c](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/edb347c7256dbd4434ad4e8b52ba71c53351b80a))
* **toolbox-core:** Add helper methods for retrieving Google ID Tokens ([#41](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/41)) ([794f40a](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/794f40a98e59d902b2593e2f26182aaf72c88923))


### Documentation

* **toolbox-core:** added a developer.md file ([#19](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/19)) ([c8cc15f](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/c8cc15f20bcfe1962c5301c9952deaa385ecab16))
* **toolbox-core:** Add guide on how to use with various orchestration frameworks ([#46](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/46)) ([58da3b1](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/58da3b1e25cc0f029105f8c3daf42347ec34d139))
* **toolbox-core:** add README ([#35](https://github.com/googleapis/mcp-toolbox-sdk-js/issues/35)) ([68105c1](https://github.com/googleapis/mcp-toolbox-sdk-js/commit/68105c1e98298efc6290e4a1ae6d9a792850150a))
