# Ethereum/BSC Contract Manager

## Overview

This is a command-line tool for managing Ethereum and Binance Smart Chain (BSC) smart contract deployments. The application provides a menu-driven interface for deploying contracts, checking wallet balances, and switching between different blockchain networks (Sepolia testnet, BSC testnet, and BSC mainnet).

The project includes Solidity smart contract compilation settings for a VAR (Variable) contract implementation with proxy pattern support, using OpenZeppelin libraries and Chainlink integrations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### CLI Application Structure
- **Entry Point**: `menu.js` - Main interactive menu for blockchain operations
- **Framework**: Node.js with ethers.js v6 for Ethereum interactions
- **Interface**: Synchronous readline-based menu system using readline-sync

### Multi-Network Support
The application supports three blockchain networks configured via environment variables:
- Sepolia (Ethereum Testnet) - Chain ID 11155111
- BSC Testnet - Chain ID 97  
- BSC Mainnet - Chain ID 56

Network switching is handled dynamically through the menu interface.

### Smart Contract Architecture
Two contract configurations exist:
1. **VAR Implementation** - Main contract logic
2. **VARProxy** - Proxy contract for upgradeable pattern

Both use identical Solidity compiler settings:
- Optimizer enabled with 200 runs
- EVM version: Cancun
- viaIR compilation enabled
- IPFS bytecode hash metadata

### Wallet Management
- Private key loaded from environment variables
- Wallet instance created with ethers.js Wallet class
- Provider connection established per selected network

## External Dependencies

### NPM Packages
- **ethers** (v6.16.0) - Ethereum blockchain interaction library
- **dotenv** (v17.2.3) - Environment variable management
- **chalk** (v4.1.2) - Terminal string styling
- **readline-sync** (v1.4.10) - Synchronous user input

### Blockchain Networks
- Sepolia RPC endpoint (via `SEPOLIA_RPC_URL` env var)
- BSC Testnet RPC endpoint (via `BSC_TESTNET_RPC_URL` env var)
- BSC Mainnet RPC endpoint (via `BSC_MAINNET_RPC_URL` env var)
- Fallback: Ankr public Sepolia RPC

### Smart Contract Libraries (Referenced in Compiler Settings)
- OpenZeppelin Contracts - Standard contract implementations
- OpenZeppelin Contracts Upgradeable - Upgradeable contract patterns
- Chainlink Contracts - Oracle integrations
- Chainlink Contracts CCIP - Cross-chain interoperability
- Forge-std - Foundry testing utilities

### Environment Variables Required
- `PRIVATE_KEY` - Wallet private key for signing transactions
- `SEPOLIA_RPC_URL` - Sepolia network RPC endpoint
- `BSC_TESTNET_RPC_URL` - BSC testnet RPC endpoint
- `BSC_MAINNET_RPC_URL` - BSC mainnet RPC endpoint